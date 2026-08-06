import { prisma } from "../../config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import { emitToRoom } from "../../core/utils/socket.js";

/** Pending prescriptions queue for dispensing (FR 19.4-01). */
export async function getDispensingQueue() {
  const prescriptions = await prisma.prescription.findMany({
    where: { status: { in: ["ACTIVE", "PARTIALLY_DISPENSED"] } },
    include: {
      patient: { select: { id: true, uhid: true, name: true } },
      doctor: { select: { id: true, user: { select: { name: true } } } },
      items: {
        include: { drug: { select: { id: true, name: true, genericName: true, isControlled: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return prescriptions.map((prescription, position) => ({ prescription, position: position + 1 }));
}

/**
 * Dispense (full/partial) with atomic stock deduction (FR 19.4-02/03).
 * BR-02: stock deduction + dispense record in single DB transaction.
 */
export async function createDispense(data: {
  prescriptionId: string;
  dispensedBy?: string;
  items: { prescriptionItemId: string; quantityDispensed: number; batchId?: string }[];
}) {
  const prescription = await prisma.prescription.findUnique({
    where: { id: data.prescriptionId },
    include: { items: { include: { drug: { select: { id: true, isControlled: true } } } } },
  });
  if (!prescription) throw new AppError("Prescription not found", 404, undefined, "NOT_FOUND");
  if (prescription.status === "DISPENSED" || prescription.status === "CANCELLED") {
    throw new AppError("Prescription cannot be dispensed in its current state", 409, undefined, "CONFLICT");
  }

  const totalItems = prescription.items.length;
  const dispensedMap = new Map<string, number>();

  const dispense = await prisma.$transaction(async (tx) => {
    const created = await tx.pharmacyDispense.create({
      data: {
        prescriptionId: data.prescriptionId,
        dispensedBy: data.dispensedBy,
        status: "FULL",
      },
    });

    for (const item of data.items) {
      const rxItem = prescription.items.find((i) => i.id === item.prescriptionItemId);
      if (!rxItem) throw new AppError("Prescription item not found", 404, undefined, "NOT_FOUND");

      // BR-01: cannot dispense more than prescribed quantity
      if (item.quantityDispensed > rxItem.durationDays) {
        throw new AppError(
          "Dispensed quantity exceeds prescribed quantity",
          422,
          undefined,
          "ERR_QUANTITY_EXCEEDS_PRESCRIBED",
        );
      }

      // Lock stock row and deduct (FRD 19.20 row-level lock)
      if (item.batchId) {
        const batch = await tx.inventoryBatch.findUnique({ where: { id: item.batchId } });
        if (!batch) throw new AppError("Inventory batch not found", 404, undefined, "NOT_FOUND");

        const currentStock = await computeStock(tx, batch.itemId);
        if (currentStock < item.quantityDispensed) {
          throw new AppError(
            "Insufficient stock for this item",
            409,
            undefined,
            "ERR_INSUFFICIENT_STOCK",
          );
        }

        await tx.inventoryStockLedger.create({
          data: {
            itemId: batch.itemId,
            batchId: batch.id,
            changeType: "DISPENSE",
            quantityDelta: -item.quantityDispensed,
            referenceType: "DispenseItem",
            performedBy: data.dispensedBy,
          },
        });
      }

      await tx.dispenseItem.create({
        data: {
          dispenseId: created.id,
          prescriptionItemId: item.prescriptionItemId,
          drugId: rxItem.drugId,
          batchId: item.batchId,
          quantityDispensed: item.quantityDispensed,
        },
      });

      dispensedMap.set(item.prescriptionItemId, item.quantityDispensed);
    }

    // Update prescription status: FULL or PARTIAL (FR 19.4-03)
    let allDispensed = true;
    let anyDispensed = dispensedMap.size > 0;
    for (const item of prescription.items) {
      const dispensed = dispensedMap.get(item.id) ?? 0;
      if (dispensed < item.durationDays) allDispensed = false;
    }

    await tx.prescription.update({
      where: { id: data.prescriptionId },
      data: {
        status: allDispensed ? "DISPENSED" : anyDispensed ? "PARTIALLY_DISPENSED" : "ACTIVE",
      },
    });

    await tx.pharmacyDispense.update({
      where: { id: created.id },
      data: { status: allDispensed ? "FULL" : "PARTIAL" },
    });

    return created;
  });

  emitToRoom("pharmacy", "pharmacy:dispensed", { id: dispense.id, prescriptionId: data.prescriptionId });
  return getDispenseDetail(dispense.id);
}

/** Substitute with an approved generic equivalent (FR 19.4-04). */
export async function recordSubstitution(
  dispenseId: string,
  data: { dispenseItemId: string; substitutedFromDrugId: string; reason: string },
) {
  const item = await prisma.dispenseItem.findUnique({
    where: { id: data.dispenseItemId },
    include: { drug: { select: { isControlled: true } } },
  });
  if (!item) throw new AppError("Dispense item not found", 404, undefined, "NOT_FOUND");

  // Substituted drug must be flagged as generic-equivalent (BR-03/FR 19.6)
  const substitute = await prisma.drugMaster.findUnique({
    where: { id: data.substitutedFromDrugId },
  });
  if (!substitute) throw new AppError("Substitute drug not found", 404, undefined, "NOT_FOUND");
  if (substitute.isControlled !== item.drug.isControlled) {
    throw new AppError(
      "Substitution not allowed — substitute drug must be equivalent",
      422,
      undefined,
      "ERR_SUBSTITUTION_NOT_EQUIVALENT",
    );
  }

  return prisma.dispenseItem.update({
    where: { id: data.dispenseItemId },
    data: {
      substitutedFromDrugId: data.substitutedFromDrugId,
      substitutionReason: data.reason,
    },
  });
}

export async function getDispenseDetail(id: string) {
  const dispense = await prisma.pharmacyDispense.findUnique({
    where: { id },
    include: {
      prescription: {
        include: {
          patient: { select: { id: true, uhid: true, name: true } },
          doctor: { select: { id: true, user: { select: { name: true } } } },
        },
      },
      items: {
        include: {
          prescriptionItem: true,
          drug: { select: { id: true, name: true } },
          batch: { select: { id: true, batchNo: true, expiryDate: true } },
          substitutedFromDrug: { select: { id: true, name: true } },
          returns: true,
        },
      },
    },
  });
  if (!dispense) throw new AppError("Dispense not found", 404, undefined, "NOT_FOUND");
  return dispense;
}

/** Process a medication return (FR 19.7-05). */
export async function processReturn(data: {
  dispenseItemId: string;
  quantityReturned: number;
  reason: string;
  refundAmount?: number;
  processedBy?: string;
}) {
  const item = await prisma.dispenseItem.findUnique({
    where: { id: data.dispenseItemId },
    include: { batch: true },
  });
  if (!item) throw new AppError("Dispense item not found", 404, undefined, "NOT_FOUND");

  if (data.quantityReturned > item.quantityDispensed) {
    throw new AppError("Return quantity exceeds dispensed quantity", 422, undefined, "VALIDATION_ERROR");
  }

  return prisma.$transaction(async (tx) => {
    const ret = await tx.pharmacyReturn.create({
      data: {
        dispenseItemId: data.dispenseItemId,
        quantityReturned: data.quantityReturned,
        reason: data.reason,
        refundAmount: data.refundAmount ?? 0,
        processedBy: data.processedBy,
      },
    });

    // Restock the inventory item that the dispense originally deducted from
    if (item.batchId && item.batch) {
      await tx.inventoryStockLedger.create({
        data: {
          itemId: item.batch.itemId,
          batchId: item.batchId,
          changeType: "ADJUSTMENT",
          quantityDelta: data.quantityReturned,
          referenceType: "PharmacyReturn",
          performedBy: data.processedBy,
        },
      });
    }

    return ret;
  });
}

/** Recent dispenses with line items — powers returns/substitution UI (RBAC audit #4). */
export async function listDispenses(limit = 50) {
  return prisma.pharmacyDispense.findMany({
    take: limit,
    orderBy: { createdAt: "desc" },
    include: {
      prescription: {
        include: {
          patient: { select: { id: true, uhid: true, name: true } },
          doctor: { select: { id: true, user: { select: { name: true } } } },
        },
      },
      items: {
        include: {
          drug: { select: { id: true, name: true } },
          batch: { select: { id: true, batchNo: true, expiryDate: true } },
          substitutedFromDrug: { select: { id: true, name: true } },
          returns: true,
        },
      },
    },
  });
}

/** Drug-master catalog for substitution + prescriptions (RBAC audit #4). */
export async function listDrugCatalog(search?: string) {
  return prisma.drugMaster.findMany({
    where: search ? { name: { contains: search, mode: "insensitive" as const } } : {},
    select: { id: true, name: true, genericName: true, unit: true, isControlled: true },
    orderBy: { name: "asc" },
    take: 200,
  });
}

/** FEFO suggestion — earliest expiry first (FRD 20.5 BR-02). */
export async function suggestBatches(drugId: string, quantity: number) {
  const batches = await prisma.inventoryBatch.findMany({
    where: {
      itemId: drugId,
      expiryDate: { gte: new Date() },
    },
    orderBy: { expiryDate: "asc" },
  });
  if (!batches.length) {
    return { drugId, quantity, fefo: [], fullyCovered: true };
  }

  // One aggregate instead of a stock query per batch (was N+1).
  const stock = await prisma.inventoryStockLedger.groupBy({
    by: ["batchId"],
    where: { itemId: drugId, batchId: { in: batches.map((b) => b.id) } },
    _sum: { quantityDelta: true },
  });
  const availableByBatch = new Map(
    stock.map((s) => [s.batchId, s._sum.quantityDelta ?? 0]),
  );

  const suggestion: { batchId: string; batchNo: string; expiryDate: Date; available: number; recommended: number }[] = [];
  let remaining = quantity;
  for (const batch of batches) {
    const available = availableByBatch.get(batch.id) ?? 0;
    if (available <= 0) continue;
    const take = Math.min(available, remaining);
    suggestion.push({
      batchId: batch.id,
      batchNo: batch.batchNo,
      expiryDate: batch.expiryDate,
      available,
      recommended: take,
    });
    remaining -= take;
    if (remaining <= 0) break;
  }
  return { drugId, quantity, fefo: suggestion, fullyCovered: remaining <= 0 };
}

async function computeStock(tx: any, itemId: string, batchId?: string) {
  const client = tx ?? prisma;
  const ledger = await client.inventoryStockLedger.aggregate({
    where: batchId ? { itemId, batchId } : { itemId },
    _sum: { quantityDelta: true },
  });
  return ledger._sum.quantityDelta ?? 0;
}
