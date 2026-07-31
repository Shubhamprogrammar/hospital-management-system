import { prisma } from "../../config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import { emitToRoom } from "../../core/utils/socket.js";

export async function createItem(data: {
  name: string;
  category: "DRUG" | "CONSUMABLE" | "EQUIPMENT";
  unit?: string;
  reorderPoint?: number;
  reorderQuantity?: number;
}) {
  return prisma.inventoryItem.create({
    data: {
      name: data.name,
      category: data.category,
      unit: data.unit,
      reorderPoint: data.reorderPoint ?? 10,
      reorderQuantity: data.reorderQuantity ?? 50,
    },
  });
}

export async function listItems() {
  const items = await prisma.inventoryItem.findMany({
    include: { batches: { orderBy: { expiryDate: "asc" } } },
    orderBy: { name: "asc" },
  });

  // Compute live stock from ledger (BR-01: derived, never stored)
  const ledger = await prisma.inventoryStockLedger.groupBy({
    by: ["itemId"],
    _sum: { quantityDelta: true },
  });

  return items.map((item) => {
    const stock = ledger.find((l) => l.itemId === item.id)?._sum.quantityDelta ?? 0;
    return { ...item, stockLevel: stock, lowStock: stock <= item.reorderPoint };
  });
}

/**
 * Receive new stock batch (GRN) (FR 20.7-02).
 */
export async function receiveBatch(data: {
  itemId: string;
  batchNo: string;
  expiryDate: string;
  supplierId?: string;
  quantity: number;
  unitCost?: number;
  performedBy?: string;
}) {
  if (data.quantity <= 0) {
    throw new AppError("Received quantity must be > 0", 400, undefined, "VALIDATION_ERROR");
  }
  const expiry = new Date(data.expiryDate);
  if (expiry <= new Date()) {
    throw new AppError("Cannot receive a batch with a past expiry date", 400, undefined, "ERR_EXPIRED_BATCH_RECEIPT");
  }

  return prisma.$transaction(async (tx) => {
    const batch = await tx.inventoryBatch.create({
      data: {
        itemId: data.itemId,
        batchNo: data.batchNo,
        expiryDate: expiry,
        supplierId: data.supplierId,
        unitCost: data.unitCost ?? 0,
      },
    });

    await tx.inventoryStockLedger.create({
      data: {
        itemId: data.itemId,
        batchId: batch.id,
        changeType: "RECEIPT",
        quantityDelta: data.quantity,
        referenceType: "InventoryBatch",
        performedBy: data.performedBy,
      },
    });

    emitToRoom("inventory", "inventory:stock-changed", { itemId: data.itemId });
    return batch;
  });
}

export async function getStock(params: { itemId?: string; batchId?: string; page: number; limit: number }) {
  const where: Record<string, unknown> = {};
  if (params.itemId) where.itemId = params.itemId;
  if (params.batchId) where.batchId = params.batchId;

  const [total, ledger] = await prisma.$transaction([
    prisma.inventoryStockLedger.count({ where }),
    prisma.inventoryStockLedger.findMany({
      where,
      include: {
        item: { select: { id: true, name: true, category: true, unit: true, reorderPoint: true } },
        batch: { select: { id: true, batchNo: true, expiryDate: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
  ]);

  return { total, ledger };
}

/**
 * Manual stock adjustment (damage/loss/count correction) (FR 20.7-04).
 */
export async function adjustStock(data: {
  itemId: string;
  batchId?: string;
  changeType: "ADJUSTMENT" | "WRITE_OFF" | "TRANSFER";
  quantityDelta: number;
  reason: string;
  performedBy?: string;
}) {
  if (data.quantityDelta === 0) {
    throw new AppError("Adjustment delta cannot be zero", 400, undefined, "VALIDATION_ERROR");
  }

  return prisma.$transaction(async (tx) => {
    if (data.quantityDelta < 0) {
      const current = await computeStock(tx, data.itemId);
      if (current + data.quantityDelta < 0) {
        throw new AppError(
          "Adjustment would result in negative stock",
          409,
          undefined,
          "ERR_NEGATIVE_STOCK_BLOCKED",
        );
      }
    }

    const ledgerEntry = await tx.inventoryStockLedger.create({
      data: {
        itemId: data.itemId,
        batchId: data.batchId,
        changeType: data.changeType,
        quantityDelta: data.quantityDelta,
        referenceType: "ADJUSTMENT",
        performedBy: data.performedBy,
      },
    });

    emitToRoom("inventory", "inventory:stock-changed", { itemId: data.itemId });
    return ledgerEntry;
  });
}

export async function listSuppliers() {
  return prisma.supplier.findMany({ orderBy: { name: "asc" } });
}

export async function createSupplier(data: { name: string; contactInfo?: unknown }) {
  return prisma.supplier.create({
    data: { name: data.name, contactInfo: (data.contactInfo as any) ?? undefined },
  });
}

export async function createPurchaseOrder(data: {
  supplierId: string;
  createdBy?: string;
  items: { itemId: string; quantityOrdered: number; unitCost: number }[];
}) {
  return prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.create({
      data: {
        supplierId: data.supplierId,
        createdBy: data.createdBy,
        items: {
          create: data.items.map((i) => ({
            itemId: i.itemId,
            quantityOrdered: i.quantityOrdered,
            unitCost: i.unitCost,
          })),
        },
      },
    });
    emitToRoom("inventory", "inventory:po-status-changed", { id: po.id, status: "DRAFT" });
    return po;
  });
}

export async function listPurchaseOrders() {
  return prisma.purchaseOrder.findMany({
    include: {
      supplier: { select: { id: true, name: true } },
      items: { include: { item: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Mark PO received — auto-creates batches + ledger entries (FR 20.7-06).
 */
export async function receivePurchaseOrder(poId: string, data: { receivedItems: { itemId: string; quantityReceived: number }[]; performedBy?: string }) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    include: { items: true },
  });
  if (!po) throw new AppError("Purchase order not found", 404, undefined, "NOT_FOUND");

  return prisma.$transaction(async (tx) => {
    for (const recv of data.receivedItems) {
      const poItem = po.items.find((i) => i.itemId === recv.itemId);
      if (!poItem) throw new AppError("Item not in purchase order", 400, undefined, "VALIDATION_ERROR");

      await tx.purchaseOrderItem.update({
        where: { id: poItem.id },
        data: { quantityReceived: poItem.quantityReceived + recv.quantityReceived },
      });

      const batch = await tx.inventoryBatch.create({
        data: {
          itemId: recv.itemId,
          batchNo: `PO-${poId.slice(0, 8)}-${Date.now().toString(36)}`,
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // default +1yr
          supplierId: po.supplierId,
          unitCost: poItem.unitCost,
        },
      });

      await tx.inventoryStockLedger.create({
        data: {
          itemId: recv.itemId,
          batchId: batch.id,
          changeType: "RECEIPT",
          quantityDelta: recv.quantityReceived,
          referenceType: "PurchaseOrder",
          performedBy: data.performedBy,
        },
      });
    }

    const allReceived = po.items.every((i) => {
      const recv = data.receivedItems.find((r) => r.itemId === i.itemId);
      return (i.quantityReceived + (recv?.quantityReceived ?? 0)) >= i.quantityOrdered;
    });

    const updated = await tx.purchaseOrder.update({
      where: { id: poId },
      data: { status: allReceived ? "RECEIVED" : "PARTIALLY_RECEIVED" },
    });

    emitToRoom("inventory", "inventory:po-status-changed", { id: poId, status: updated.status });
    return updated;
  });
}

export async function getAlerts() {
  const items = await listItems();
  const lowStock = items.filter((i) => i.lowStock);

  const expiringSoon = await prisma.inventoryBatch.findMany({
    where: {
      expiryDate: { gte: new Date(), lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    },
    include: { item: { select: { id: true, name: true } } },
    orderBy: { expiryDate: "asc" },
  });

  return { lowStock, expiringSoon };
}

async function computeStock(tx: any, itemId: string) {
  const client = tx ?? prisma;
  const ledger = await client.inventoryStockLedger.aggregate({
    where: { itemId },
    _sum: { quantityDelta: true },
  });
  return ledger._sum.quantityDelta ?? 0;
}
