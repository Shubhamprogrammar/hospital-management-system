import { Router } from "express";
import { authMiddleware } from "../../core/middleware/auth.middleware.js";
import { authorize } from "../../core/middleware/authorize.js";
import {
  createItemHandler,
  listItemsHandler,
  receiveBatchHandler,
  getStockHandler,
  adjustStockHandler,
  createSupplierHandler,
  listSuppliersHandler,
  createPurchaseOrderHandler,
  listPurchaseOrdersHandler,
  receivePurchaseOrderHandler,
  getAlertsHandler,
} from "./inventory.controller.js";

const inventoryRoutes = Router();

inventoryRoutes.use(authMiddleware);

inventoryRoutes.get("/stock", getStockHandler);
inventoryRoutes.get("/alerts", getAlertsHandler);
inventoryRoutes.get("/suppliers", listSuppliersHandler);
inventoryRoutes.get("/items", listItemsHandler);
inventoryRoutes.get("/purchase-orders", listPurchaseOrdersHandler);

inventoryRoutes.post(
  "/items",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "INVENTORY_MANAGER"),
  createItemHandler,
);
inventoryRoutes.post(
  "/batches",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "INVENTORY_MANAGER"),
  receiveBatchHandler,
);
inventoryRoutes.post(
  "/adjustments",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "INVENTORY_MANAGER"),
  adjustStockHandler,
);
inventoryRoutes.post(
  "/suppliers",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "INVENTORY_MANAGER"),
  createSupplierHandler,
);
inventoryRoutes.post(
  "/purchase-orders",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "INVENTORY_MANAGER"),
  createPurchaseOrderHandler,
);
inventoryRoutes.patch(
  "/purchase-orders/:id/receive",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "INVENTORY_MANAGER"),
  receivePurchaseOrderHandler,
);

export { inventoryRoutes };
