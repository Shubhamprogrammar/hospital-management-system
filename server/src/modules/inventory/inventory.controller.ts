import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync.js";
import { sendSuccess, sendPaginated } from "../../core/utils/apiResponse.js";
import { parsePagination, buildPaginationMeta } from "../../core/utils/pagination.js";
import { writeAuditLog } from "../../core/utils/audit.js";
import {
  createItem,
  listItems,
  receiveBatch,
  getStock,
  adjustStock,
  createSupplier,
  listSuppliers,
  createPurchaseOrder,
  listPurchaseOrders,
  receivePurchaseOrder,
  getAlerts,
} from "./inventory.service.js";

export const createItemHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const item = await createItem(req.body);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "ITEM_CREATED",
      module: "inventory",
      entityType: "InventoryItem",
      entityId: item.id,
      after: { name: item.name, category: item.category },
    },
    req,
  );
  sendSuccess(res, item, 201);
});

export const listItemsHandler = catchAsync(async (_req: Request, res: Response) => {
  const items = await listItems();
  sendSuccess(res, items);
});

export const receiveBatchHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const batch = await receiveBatch({ ...req.body, performedBy: actor?.id });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "BATCH_RECEIVED",
      module: "inventory",
      entityType: "InventoryBatch",
      entityId: batch.id,
      after: { batchNo: batch.batchNo, quantity: req.body.quantity },
    },
    req,
  );
  sendSuccess(res, batch, 201);
});

export const getStockHandler = catchAsync(async (req: Request, res: Response) => {
  const pagination = parsePagination(req.query.page, req.query.limit);
  const result = await getStock({
    ...pagination,
    itemId: req.query.itemId as string | undefined,
    batchId: req.query.batchId as string | undefined,
  });
  sendPaginated(res, result.ledger, buildPaginationMeta(result.total, pagination));
});

export const adjustStockHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const entry = await adjustStock({ ...req.body, performedBy: actor?.id });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "STOCK_ADJUSTED",
      module: "inventory",
      entityType: "InventoryStockLedger",
      entityId: entry.id,
      after: { changeType: req.body.changeType, quantityDelta: req.body.quantityDelta, reason: req.body.reason },
    },
    req,
  );
  sendSuccess(res, entry, 201);
});

export const createSupplierHandler = catchAsync(async (req: Request, res: Response) => {
  const supplier = await createSupplier(req.body);
  sendSuccess(res, supplier, 201);
});

export const listSuppliersHandler = catchAsync(async (_req: Request, res: Response) => {
  const suppliers = await listSuppliers();
  sendSuccess(res, suppliers);
});

export const createPurchaseOrderHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const po = await createPurchaseOrder({ ...req.body, createdBy: actor?.id });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "PO_CREATED",
      module: "inventory",
      entityType: "PurchaseOrder",
      entityId: po.id,
      after: { supplierId: req.body.supplierId },
    },
    req,
  );
  sendSuccess(res, po, 201);
});

export const listPurchaseOrdersHandler = catchAsync(async (_req: Request, res: Response) => {
  const orders = await listPurchaseOrders();
  sendSuccess(res, orders);
});

export const receivePurchaseOrderHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const po = await receivePurchaseOrder(req.params.id, { ...req.body, performedBy: actor?.id });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "PO_RECEIVED",
      module: "inventory",
      entityType: "PurchaseOrder",
      entityId: req.params.id,
      after: { status: po.status },
    },
    req,
  );
  sendSuccess(res, po);
});

export const getAlertsHandler = catchAsync(async (_req: Request, res: Response) => {
  const alerts = await getAlerts();
  sendSuccess(res, alerts);
});
