import { api } from "@/shared/services/api";
import type {
  Bill,
  BillStatus,
  CreditNote,
  InsurancePolicy,
  Payment,
  PaymentMode,
  ReconciliationSummary,
} from "@/shared/types/domain";
import type { PaginationParams } from "@/shared/types/api";

// ---------- Billing ----------

export interface BillItemInput {
  sourceModule: "CONSULTATION" | "LAB" | "PHARMACY" | "ROOM_CHARGE" | "AMBULANCE" | "MISC";
  sourceReferenceId?: string;
  description: string;
  quantity?: number;
  unitPrice: number;
}

export interface CreateBillInput {
  patientId: string;
  opdVisitId?: string;
  ipdAdmissionId?: string;
  ambulanceTripId?: string;
  items: BillItemInput[];
}

export function listBills(params: PaginationParams & { status?: BillStatus; patientId?: string; search?: string } = {}) {
  return api.list<Bill>("/billing/bills", params);
}

export function getBill(id: string) {
  return api.get<Bill>(`/billing/bills/${id}`);
}

export function createBill(input: CreateBillInput) {
  return api.post<Bill>("/billing/bills", input);
}

export function applyDiscount(billId: string, input: { percentage: number; reason?: string }) {
  return api.patch<Bill>(`/billing/bills/${billId}/discount`, input);
}

export function approveDiscount(billId: string, input?: { approve: boolean; reason?: string }) {
  return api.post<Bill>(`/billing/bills/${billId}/discount/approve`, input);
}

export function applyInsurance(billId: string, input: { policyId: string; amount?: number }) {
  return api.patch<Bill>(`/billing/bills/${billId}/insurance`, input);
}

export function finalizeBill(billId: string) {
  return api.patch<Bill>(`/billing/bills/${billId}/finalize`);
}

export function issueCreditNote(billId: string, input: { amount: number; reason: string }) {
  return api.post<CreditNote>(`/billing/bills/${billId}/credit-note`, input);
}

export function createInsurancePolicy(input: { patientId: string; providerName: string; policyNo: string; coverageLimit: number; validTill: string }) {
  return api.post<InsurancePolicy>("/billing/insurance-policies", input);
}

// ---------- Payments ----------

export interface RecordPaymentInput {
  billId: string;
  amount: number;
  mode: PaymentMode;
  gatewayTransactionId?: string;
}

export function recordPayment(input: RecordPaymentInput) {
  return api.post<Payment>("/payments", input);
}

export function initiateGatewayPayment(input: { billId: string; amount: number; mode?: PaymentMode }) {
  return api.post<{ paymentUrl: string; transactionId: string }>("/payments/initiate-gateway", input);
}

export function processRefund(paymentId: string, input: { amount: number; reason: string }) {
  return api.post<Payment>(`/payments/${paymentId}/refund`, input);
}

export function getReconciliation(query: PaginationParams & { date?: string } = {}) {
  return api.get<ReconciliationSummary[]>("/payments/reconciliation", query);
}

export function createReconciliation(input: { date: string; countedAmount: number }) {
  return api.post<ReconciliationSummary>("/payments/reconciliation", input);
}
