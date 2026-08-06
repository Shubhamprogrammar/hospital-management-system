import { prisma } from "../../config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import { randomBytes } from "crypto";
import { emitToRoom, emitToUser } from "../../core/utils/socket.js";
import { notifyUser } from "../../core/utils/notifications.js";
import { cacheDel, cacheGet, cacheSet } from "../../config/redis.js";

const CATALOG_CACHE_KEY = "lab:catalog";

export async function listTestCatalog() {
  const cached = await cacheGet(CATALOG_CACHE_KEY);
  if (cached) return JSON.parse(cached);

  const tests = await prisma.labTest.findMany({
    include: { parameters: true },
    orderBy: { name: "asc" },
  });
  await cacheSet(CATALOG_CACHE_KEY, JSON.stringify(tests), 1800); // 30 min TTL
  return tests;
}

export async function createLabTest(data: {
  name: string;
  code: string;
  category?: string;
  price?: number;
  sampleType?: string;
  turnaroundHours?: number;
  parameters?: Array<{
    name: string;
    unit?: string;
    referenceRangeMin?: number;
    referenceRangeMax?: number;
    criticalLow?: number;
    criticalHigh?: number;
  }>;
}) {
  if (!data.name?.trim() || !data.code?.trim()) {
    throw new AppError("Name and code are required", 400, undefined, "VALIDATION_ERROR");
  }

  const existing = await prisma.labTest.findUnique({ where: { code: data.code } });
  if (existing) {
    throw new AppError("A test with this code already exists", 409, undefined, "CONFLICT");
  }

  const test = await prisma.labTest.create({
    data: {
      name: data.name.trim(),
      code: data.code.trim(),
      category: data.category,
      price: data.price,
      sampleType: data.sampleType,
      turnaroundHours: data.turnaroundHours,
      parameters: data.parameters?.length
        ? { create: data.parameters.map((p) => ({ ...p, name: p.name.trim() })) }
        : undefined,
    },
    include: { parameters: true },
  });

  await cacheDel(CATALOG_CACHE_KEY);
  return test;
}

export async function createLabOrder(data: {
  patientId: string;
  doctorId: string;
  opdVisitId?: string;
  ipdAdmissionId?: string;
  testIds: string[];
}) {
  if (!data.testIds.length) {
    throw new AppError("At least one test is required", 400, undefined, "VALIDATION_ERROR");
  }

  // Drop nullish/empty entries so Prisma never emits `IN (NULL)`, but still
  // reject the payload if any entry was invalid (matches the old behavior).
  const testIds = data.testIds.filter((id): id is string => typeof id === "string" && id.length > 0);
  if (testIds.length !== data.testIds.length) {
    throw new AppError("One or more tests do not exist", 400, undefined, "ERR_INVALID_TEST");
  }

  // Validate tests exist
  const tests = await prisma.labTest.findMany({
    where: { id: { in: testIds } },
    select: { id: true },
  });
  if (tests.length !== testIds.length) {
    throw new AppError("One or more tests do not exist", 400, undefined, "ERR_INVALID_TEST");
  }

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.labOrder.create({
      data: {
        patientId: data.patientId,
        doctorId: data.doctorId,
        opdVisitId: data.opdVisitId,
        ipdAdmissionId: data.ipdAdmissionId,
        barcode: `LAB-${randomBytes(6).toString("hex").toUpperCase()}`,
        orderTests: {
          create: testIds.map((testId) => ({ testId })),
        },
      },
    });
    return created;
  });

  emitToRoom("lab", "lab:order-status-changed", { id: order.id, status: "ORDERED" });
  return order;
}

export async function listLabOrders(params: {
  patientId?: string;
  status?: string;
  date?: string;
  page: number;
  limit: number;
}) {
  const where: Record<string, unknown> = {};
  if (params.patientId) where.patientId = params.patientId;
  if (params.status) where.status = params.status;
  if (params.date) {
    const d = new Date(params.date);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    where.createdAt = { gte: d, lt: next };
  }

  const [total, orders] = await prisma.$transaction([
    prisma.labOrder.count({ where }),
    prisma.labOrder.findMany({
      where,
      include: {
        patient: { select: { id: true, uhid: true, name: true } },
        doctor: { select: { id: true, user: { select: { name: true } } } },
        orderTests: { include: { test: { select: { id: true, name: true, code: true } } } },
        results: { include: { testParameter: { select: { id: true, name: true, unit: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
  ]);

  return { total, orders };
}

/** Mark sample collected + barcode (FR 18.4-02). */
export async function collectSample(orderId: string) {
  const order = await prisma.labOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError("Lab order not found", 404, undefined, "NOT_FOUND");
  if (order.status !== "ORDERED") {
    throw new AppError("Sample can only be collected from ORDERED orders", 409, undefined, "CONFLICT");
  }

  const updated = await prisma.labOrder.update({
    where: { id: orderId },
    data: { status: "SAMPLE_COLLECTED" },
  });
  emitToRoom("lab", "lab:order-status-changed", { id: orderId, status: "SAMPLE_COLLECTED" });
  return updated;
}

/**
 * Technician enters results (FR 18.4-03). Flags abnormal + critical values.
 */
export async function enterResults(
  orderId: string,
  data: { items: { testParameterId: string; value: string; unit?: string }[]; enteredBy?: string },
) {
  const order = await prisma.labOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError("Lab order not found", 404, undefined, "NOT_FOUND");
  if (order.status === "ORDERED") {
    throw new AppError("Sample must be collected before entering results", 409, undefined, "ERR_SAMPLE_NOT_COLLECTED");
  }
  if (order.status === "VERIFIED" || order.status === "REPORT_RELEASED") {
    throw new AppError("Results already entered and verified", 409, undefined, "ERR_ALREADY_VERIFIED");
  }

  const results: {
    id: string;
    isCritical: boolean;
    isAbnormal: boolean;
    value: string;
  }[] = [];

  for (const item of data.items) {
    const param = await prisma.labTestParameter.findUnique({
      where: { id: item.testParameterId },
    });
    if (!param) throw new AppError("Test parameter not found", 404, undefined, "NOT_FOUND");

    const value = Number(item.value);
    let isAbnormal = false;
    let isCritical = false;

    if (!Number.isNaN(value)) {
      if (param.referenceRangeMin != null && value < Number(param.referenceRangeMin)) isAbnormal = true;
      if (param.referenceRangeMax != null && value > Number(param.referenceRangeMax)) isAbnormal = true;
      if (param.criticalLow != null && value < Number(param.criticalLow)) isCritical = true;
      if (param.criticalHigh != null && value > Number(param.criticalHigh)) isCritical = true;
    }

    const result = await prisma.labResult.create({
      data: {
        orderId,
        testParameterId: item.testParameterId,
        value: item.value,
        unit: item.unit ?? param.unit,
        isAbnormal,
        isCritical,
        enteredBy: data.enteredBy,
      },
    });
    results.push(result);
  }

  await prisma.labOrder.update({
    where: { id: orderId },
    data: { status: "RESULTS_ENTERED" },
  });

  // Critical value alert (FR 18.4-03/BR-02)
  const critical = results.filter((r) => r.isCritical);
  if (critical.length > 0) {
    const orderWithDoctor = await prisma.labOrder.findUnique({
      where: { id: orderId },
      include: { doctor: { select: { userId: true } } },
    });
    if (orderWithDoctor?.doctor) {
      await notifyUser(
        orderWithDoctor.doctor.userId,
        "lab-critical-value",
        { orderId, criticalCount: critical.length },
      );
    }
    emitToRoom("lab", "lab:critical-alert", { orderId, patientId: order.patientId });
  }

  return { results, criticalCount: critical.length };
}

/**
 * Pathologist verifies (FR 18.4-04). Segregation of duties — verifier
 * cannot be the enterer (FRD 18.20).
 */
export async function verifyResults(orderId: string, verifierId?: string) {
  const order = await prisma.labOrder.findUnique({
    where: { id: orderId },
    include: { results: true },
  });
  if (!order) throw new AppError("Lab order not found", 404, undefined, "NOT_FOUND");
  if (order.status !== "RESULTS_ENTERED") {
    throw new AppError("Results must be entered before verification", 409, undefined, "CONFLICT");
  }

  const enteredBy = order.results[0]?.enteredBy;
  if (enteredBy && verifierId && enteredBy === verifierId) {
    throw new AppError(
      "The technician who entered results cannot verify them (segregation of duties)",
      400,
      undefined,
      "ERR_VERIFIER_SAME_AS_ENTERER",
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.labResult.updateMany({
      where: { orderId },
      data: { verifiedBy: verifierId, verifiedAt: new Date() },
    });
    return tx.labOrder.update({
      where: { id: orderId },
      data: { status: "VERIFIED" },
    });
  });

  emitToRoom("lab", "lab:order-status-changed", { id: orderId, status: "VERIFIED" });
  return updated;
}

/** Release report (FR 18.4-05). */
export async function releaseReport(orderId: string) {
  const order = await prisma.labOrder.findUnique({
    where: { id: orderId },
    include: { patient: { select: { userId: true } } },
  });
  if (!order) throw new AppError("Lab order not found", 404, undefined, "NOT_FOUND");
  if (order.status !== "VERIFIED") {
    throw new AppError("Report cannot be released before verification", 409, undefined, "CONFLICT");
  }

  const updated = await prisma.labOrder.update({
    where: { id: orderId },
    data: { status: "REPORT_RELEASED" },
  });

  if (order.patient.userId) {
    await notifyUser(order.patient.userId, "lab-report-released", { orderId });
  }
  emitToRoom("lab", "lab:report-released", { orderId });
  return updated;
}
