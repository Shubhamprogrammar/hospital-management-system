import { api } from "@/shared/services/api";
import type {
  InventoryBatch,
  InventoryItem,
  PharmacyDispense,
  PharmacyQueueItem,
  PurchaseOrder,
  StockLine,
  Supplier,
} from "@/shared/types/domain";
import type { PaginationParams } from "@/shared/types/api";

// ---------- Pharmacy ----------

export interface CreateDispenseInput {
  prescriptionId: string;
  items: Array<{ prescriptionItemId: string; drugId: string; batchId?: string; quantityDispensed: number }>;
}

export interface SubstitutionInput {
  prescriptionItemId: string;
  drugId: string;
  batchId?: string;
  quantityDispensed: number;
  reason: string;
}

export function getPharmacyQueue(query: { departmentId?: string } = {}) {
  return api.get<PharmacyQueueItem[]>("/pharmacy/queue", query);
}

export function createDispense(input: CreateDispenseInput) {
  return api.post<PharmacyDispense>("/pharmacy/dispenses", input);
}

export function getDispense(id: string) {
  return api.get<PharmacyDispense>(`/pharmacy/dispenses/${id}`);
}

export function recordSubstitution(dispenseId: string, input: SubstitutionInput) {
  return api.post<PharmacyDispense>(`/pharmacy/dispenses/${dispenseId}/substitute`, input);
}

export function processReturn(input: { dispenseItemId: string; quantityReturned: number; reason: string }) {
  return api.post<{ returned: boolean }>("/pharmacy/returns", input);
}

export function suggestBatches(query: { drugId: string; quantity?: number }) {
  return api.get<InventoryBatch[]>("/pharmacy/batches/suggest", query);
}

// ---------- Inventory ----------

export interface CreateItemInput {
  name: string;
  category: "DRUG" | "CONSUMABLE" | "EQUIPMENT";
  unit?: string;
  reorderPoint?: number;
  reorderQuantity?: number;
}

export function listItems(params: PaginationParams & { search?: string; category?: string } = {}) {
  return api.list<InventoryItem>("/inventory/items", params);
}

export function createItem(input: CreateItemInput) {
  return api.post<InventoryItem>("/inventory/items", input);
}

export function getStock(query: PaginationParams & { search?: string; lowStock?: boolean } = {}) {
  return api.list<StockLine>("/inventory/stock", query);
}

export function receiveBatch(input: { itemId: string; batchNo: string; expiryDate: string; supplierId?: string; quantity: number; unitCost?: number }) {
  return api.post<InventoryBatch>("/inventory/batches", input);
}

export function adjustStock(input: { itemId: string; batchId?: string; quantityDelta: number; reason?: string }) {
  return api.post<{ adjusted: boolean }>("/inventory/adjustments", input);
}

export function listSuppliers(params: PaginationParams & { search?: string } = {}) {
  return api.list<Supplier>("/inventory/suppliers", params);
}

export function createSupplier(input: { name: string; contactInfo?: unknown }) {
  return api.post<Supplier>("/inventory/suppliers", input);
}

export function listPurchaseOrders(params: PaginationParams & { status?: string } = {}) {
  return api.list<PurchaseOrder>("/inventory/purchase-orders", params);
}

export function createPurchaseOrder(input: { supplierId: string; items: Array<{ itemId: string; quantityOrdered: number; unitCost?: number }> }) {
  return api.post<PurchaseOrder>("/inventory/purchase-orders", input);
}

export function receivePurchaseOrder(poId: string, input: { items: Array<{ itemId: string; quantityReceived: number }> }) {
  return api.patch<PurchaseOrder>(`/inventory/purchase-orders/${poId}/receive`, input);
}

/**
 * Low-stock / expiring alerts. The backend returns a grouped object
 * (e.g. `{ lowStock: InventoryItem[] }`), not a flat array.
 */
export function getInventoryAlerts() {
  return api.get<{ lowStock: InventoryItem[] }>("/inventory/alerts");
}
