import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync.js";
import { sendSuccess, sendPaginated } from "../../core/utils/apiResponse.js";
import { parsePagination, buildPaginationMeta } from "../../core/utils/pagination.js";
import { writeAuditLog } from "../../core/utils/audit.js";
import { resolveDoctorId } from "../../core/utils/doctorRef.js";
import {
  listTestCatalog,
  createLabTest,
  createLabOrder,
  listLabOrders,
  collectSample,
  enterResults,
  verifyResults,
  releaseReport,
} from "./laboratory.service.js";

export const listCatalogHandler = catchAsync(async (_req: Request, res: Response) => {
  const tests = await listTestCatalog();
  sendSuccess(res, tests);
});

export const createLabTestHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const test = await createLabTest(req.body);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "LAB_TEST_CREATED",
      module: "laboratory",
      entityType: "LabTest",
      entityId: test.id,
      after: { name: test.name, code: test.code },
    },
    req,
  );
  sendSuccess(res, test, 201);
});

export const createLabOrderHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const doctorId = await resolveDoctorId(actor?.id, req.body.doctorId, "ordering lab tests");
  const order = await createLabOrder({ ...req.body, doctorId });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "ORDER_CREATED",
      module: "laboratory",
      entityType: "LabOrder",
      entityId: order.id,
      after: { testIds: req.body.testIds },
    },
    req,
  );
  sendSuccess(res, order, 201);
});

export const listLabOrdersHandler = catchAsync(async (req: Request, res: Response) => {
  const pagination = parsePagination(req.query.page, req.query.limit);
  const result = await listLabOrders({
    ...pagination,
    patientId: req.query.patientId as string | undefined,
    status: req.query.status as string | undefined,
    date: req.query.date as string | undefined,
  });
  sendPaginated(res, result.orders, buildPaginationMeta(result.total, pagination));
});

export const collectSampleHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const order = await collectSample(req.params.id);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "SAMPLE_COLLECTED",
      module: "laboratory",
      entityType: "LabOrder",
      entityId: req.params.id,
      after: { status: "SAMPLE_COLLECTED" },
    },
    req,
  );
  sendSuccess(res, order);
});

export const enterResultsHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const result = await enterResults(req.params.id, { ...req.body, enteredBy: actor?.id });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "RESULTS_ENTERED",
      module: "laboratory",
      entityType: "LabOrder",
      entityId: req.params.id,
      after: { resultCount: result.results.length, critical: result.criticalCount },
    },
    req,
  );
  sendSuccess(res, result);
});

export const verifyResultsHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const order = await verifyResults(req.params.id, actor?.id);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "VERIFIED",
      module: "laboratory",
      entityType: "LabOrder",
      entityId: req.params.id,
      after: { status: "VERIFIED" },
    },
    req,
  );
  sendSuccess(res, order);
});

export const releaseReportHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const order = await releaseReport(req.params.id);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "REPORT_RELEASED",
      module: "laboratory",
      entityType: "LabOrder",
      entityId: req.params.id,
      after: { status: "REPORT_RELEASED" },
    },
    req,
  );
  sendSuccess(res, order);
});
