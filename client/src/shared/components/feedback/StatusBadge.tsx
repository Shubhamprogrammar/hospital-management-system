import { Badge } from "@/shared/components/ui/badge";

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  ACTIVE: "success",
  CONFIRMED: "success",
  COMPLETED: "success",
  SUCCESS: "success",
  PAID: "success",
  READ: "secondary",
  AVAILABLE: "success",
  APPROVED: "success",
  RELEASED: "success",
  VERIFIED: "success",
  FINALIZED: "success",
  SENT: "secondary",
  DELIVERED: "secondary",
  DISCHARGED: "secondary",

  PENDING: "warning",
  CHECKED_IN: "warning",
  WAITING: "warning",
  PARTIALLY_PAID: "warning",
  PARTIALLY_RECEIVED: "warning",
  PARTIALLY_DISPENSED: "warning",
  NEEDS_RESCHEDULE: "warning",
  VITALS_DONE: "warning",
  ADMITTED: "warning",
  IN_TREATMENT: "warning",
  DISCHARGE_PLANNED: "warning",
  CLEANING: "warning",
  RESERVED: "warning",
  ORDERED: "warning",
  SAMPLE_COLLECTED: "warning",
  RESULTS_ENTERED: "warning",
  QUEUED: "warning",
  PROCESSING: "warning",
  EN_ROUTE_TO_PICKUP: "warning",
  ARRIVED: "warning",
  TRANSPORTING: "warning",
  ARRIVED_HOSPITAL: "warning",
  PENDING_APPROVAL: "warning",
  PENDING_REVIEW: "warning",
  ANSWERED: "warning",
  OPEN: "warning",
  IN_PROGRESS: "warning",
  ASSIGNED: "warning",
  IN_CONSULTATION: "warning",

  CANCELLED: "destructive",
  NO_SHOW: "destructive",
  FAILED: "destructive",
  REJECTED: "destructive",
  EXPIRED: "destructive",
  ABANDONED: "destructive",
  MAINTENANCE: "destructive",
  REFERRED_IPD: "destructive",
  ESCALATED: "destructive",

  DRAFT: "outline",
  DEFAULT: "outline",
};

function label(status: string) {
  return status.replace(/_/g, " ");
}

export function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_VARIANTS[status] ?? STATUS_VARIANTS.DEFAULT;
  return <Badge variant={variant}>{label(status)}</Badge>;
}
