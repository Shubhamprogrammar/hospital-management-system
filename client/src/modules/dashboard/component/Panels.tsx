"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  ActivityIcon,
  AmbulanceIcon,
  ArrowRightIcon,
  BedDoubleIcon,
  CalendarClockIcon,
  ClipboardListIcon,
  DollarSignIcon,
  FlaskConicalIcon,
  PackageIcon,
  PillIcon,
  UsersIcon,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import { StatusBadge } from "@/shared/components/feedback/StatusBadge";
import { listAppointments } from "@/shared/services/appointments.service";
import { getOpdQueue } from "@/shared/services/appointments.service";
import { listDepartments } from "@/shared/services/org.service";
import { listPrescriptions, listLabOrders } from "@/shared/services/clinical.service";
import { getPharmacyQueue, getInventoryAlerts } from "@/shared/services/pharmacy.service";
import { listBills } from "@/shared/services/billing.service";
import { listAdmissions } from "@/shared/services/ipd.service";
import { listRequests } from "@/shared/services/ambulance.service";
import { listConversations } from "@/shared/services/chat.service";
import { cn, toLocalDate } from "@/shared/lib/utils";

function PanelShell({
  title,
  href,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  href: string;
  icon: typeof ActivityIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="flex-row items-center justify-between space-y-0 py-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="size-4 text-primary" />
          {title}
        </CardTitle>
        <Link href={href}>
          <Button variant="ghost" size="sm" className="gap-1 text-xs">
            View all <ArrowRightIcon className="size-3.5" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="flex-1 pb-4">{children}</CardContent>
    </Card>
  );
}

function PanelLoading() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function Row({
  title,
  subtitle,
  right,
  icon: Icon = UsersIcon,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{title}</p>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

// ---------- Appointments ----------

export function AppointmentsPanel({ limit = 5, className }: { limit?: number; className?: string }) {
  const query = useQuery({
    queryKey: ["dashboard", "panel", "appointments", limit],
    queryFn: () => listAppointments({ limit }),
    retry: 1,
  });

  return (
    <PanelShell title="Recent Appointments" href="/appointments" icon={CalendarClockIcon} className={className}>
      {query.isLoading ? (
        <PanelLoading />
      ) : query.isError ? (
        <ErrorState error={query.error} />
      ) : query.data?.items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No appointments yet.</p>
      ) : (
        <div className="divide-y divide-border">
          {query.data?.items.map((a) => (
            <Row
              key={a.id}
              title={a.patient?.name ?? "Patient"}
              subtitle={`${a.doctor?.name ?? "Doctor"} · ${a.department?.name ?? ""}`}
              right={
                <>
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {new Date(a.appointmentDate).toLocaleDateString()} {a.slotStartTime}
                  </span>
                  <StatusBadge status={a.status} />
                </>
              }
            />
          ))}
        </div>
      )}
    </PanelShell>
  );
}

// ---------- OPD queue ----------

export function OpdQueuePanel({ className }: { className?: string }) {
  const departments = useQuery({
    queryKey: ["dashboard", "panel", "departments"],
    queryFn: () => listDepartments({ limit: 1, isActive: true }),
    retry: 1,
  });
  const departmentId = departments.data?.items[0]?.id;
  const queue = useQuery({
    queryKey: ["dashboard", "panel", "opdQueue", departmentId],
    queryFn: () => getOpdQueue({ departmentId, date: toLocalDate(new Date()) }),
    enabled: !!departmentId,
    retry: 1,
  });

  return (
    <PanelShell title="OPD Queue" href="/opd" icon={ClipboardListIcon} className={className}>
      {queue.isLoading ? (
        <PanelLoading />
      ) : queue.isError ? (
        <ErrorState error={queue.error} />
      ) : !queue.data || queue.data.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Queue is clear.</p>
      ) : (
        <div className="divide-y divide-border">
          {queue.data.slice(0, 5).map((item) => (
            <div key={item.visit?.id ?? item.position} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {item.position}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.visit?.patient?.name ?? "Waiting"}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.visit?.doctor?.name ?? ""}</p>
                </div>
              </div>
              {item.avgWaitMinutes !== undefined && (
                <span className="shrink-0 text-xs text-muted-foreground">~{item.avgWaitMinutes}m wait</span>
              )}
            </div>
          ))}
        </div>
      )}
    </PanelShell>
  );
}

// ---------- Prescriptions ----------

export function PrescriptionsPanel({ limit = 5, className }: { limit?: number; className?: string }) {
  const query = useQuery({
    queryKey: ["dashboard", "panel", "prescriptions", limit],
    queryFn: () => listPrescriptions({ limit }),
    retry: 1,
  });

  return (
    <PanelShell title="Recent Prescriptions" href="/prescriptions" icon={PillIcon} className={className}>
      {query.isLoading ? (
        <PanelLoading />
      ) : query.isError ? (
        <ErrorState error={query.error} />
      ) : query.data?.items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No prescriptions yet.</p>
      ) : (
        <div className="divide-y divide-border">
          {query.data?.items.map((p) => (
            <Row
              key={p.id}
              title={p.patient?.name ?? "Patient"}
              subtitle={p.doctor?.name ?? ""}
              icon={PillIcon}
              right={<StatusBadge status={p.status} />}
            />
          ))}
        </div>
      )}
    </PanelShell>
  );
}

// ---------- Lab orders ----------

export function LabOrdersPanel({ limit = 5, className }: { limit?: number; className?: string }) {
  const query = useQuery({
    queryKey: ["dashboard", "panel", "labOrders", limit],
    queryFn: () => listLabOrders({ limit }),
    retry: 1,
  });

  return (
    <PanelShell title="Lab Orders" href="/laboratory" icon={FlaskConicalIcon} className={className}>
      {query.isLoading ? (
        <PanelLoading />
      ) : query.isError ? (
        <ErrorState error={query.error} />
      ) : query.data?.items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No lab orders.</p>
      ) : (
        <div className="divide-y divide-border">
          {query.data?.items.map((o) => (
            <Row
              key={o.id}
              title={o.patient?.name ?? "Patient"}
              subtitle={`${o.orderTests?.length ?? 0} tests · ${o.barcode}`}
              icon={FlaskConicalIcon}
              right={<StatusBadge status={o.status} />}
            />
          ))}
        </div>
      )}
    </PanelShell>
  );
}

// ---------- Pharmacy queue ----------

export function PharmacyQueuePanel({ className }: { className?: string }) {
  const query = useQuery({
    queryKey: ["dashboard", "panel", "pharmacyQueue"],
    queryFn: () => getPharmacyQueue(),
    retry: 1,
  });

  return (
    <PanelShell title="Pharmacy Queue" href="/pharmacy" icon={PillIcon} className={className}>
      {query.isLoading ? (
        <PanelLoading />
      ) : query.isError ? (
        <ErrorState error={query.error} />
      ) : !query.data || query.data.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nothing waiting to dispense.</p>
      ) : (
        <div className="divide-y divide-border">
          {query.data.slice(0, 5).map((item) => (
            <div key={item.prescription?.id ?? item.position} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-sm font-semibold text-rose-500">
                  {item.position}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.prescription?.patient?.name ?? "Waiting"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.prescription?.items?.length ?? 0} items
                  </p>
                </div>
              </div>
              {item.prescription?.status && <StatusBadge status={item.prescription.status} />}
            </div>
          ))}
        </div>
      )}
    </PanelShell>
  );
}

// ---------- Inventory alerts ----------

export function InventoryAlertsPanel({ limit = 4, className }: { limit?: number; className?: string }) {
  const query = useQuery({
    queryKey: ["dashboard", "panel", "inventoryAlerts"],
    queryFn: () => getInventoryAlerts(),
    retry: 1,
  });
  const lowStock = query.data?.lowStock ?? [];

  return (
    <PanelShell title="Inventory Alerts" href="/inventory" icon={PackageIcon} className={className}>
      {query.isLoading ? (
        <PanelLoading />
      ) : query.isError ? (
        <ErrorState error={query.error} />
      ) : lowStock.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">All good — no alerts.</p>
      ) : (
        <ul className="space-y-3">
          {lowStock.slice(0, limit).map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <PackageIcon className="size-4 shrink-0 text-warning" />
                <span className="truncate">{item.name}</span>
              </span>
              <Badge variant="warning">Low stock · {item.stockLevel ?? 0}</Badge>
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  );
}

// ---------- Bills ----------

export function BillsPanel({ limit = 5, className }: { limit?: number; className?: string }) {
  const query = useQuery({
    queryKey: ["dashboard", "panel", "bills", limit],
    queryFn: () => listBills({ limit }),
    retry: 1,
  });

  const formatMoney = (v: number | string) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(v));

  return (
    <PanelShell title="Recent Bills" href="/billing" icon={DollarSignIcon} className={className}>
      {query.isLoading ? (
        <PanelLoading />
      ) : query.isError ? (
        <ErrorState error={query.error} />
      ) : query.data?.items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No bills yet.</p>
      ) : (
        <div className="divide-y divide-border">
          {query.data?.items.map((bill) => (
            <Row
              key={bill.id}
              title={bill.patient?.name ?? "Patient"}
              subtitle={bill.invoiceNo ?? bill.id.slice(0, 8)}
              icon={DollarSignIcon}
              right={
                <>
                  <span className="text-sm font-semibold">{formatMoney(bill.totalAmount)}</span>
                  <StatusBadge status={bill.status} />
                </>
              }
            />
          ))}
        </div>
      )}
    </PanelShell>
  );
}

// ---------- IPD admissions ----------

export function AdmissionsPanel({ limit = 5, className }: { limit?: number; className?: string }) {
  const query = useQuery({
    queryKey: ["dashboard", "panel", "admissions", limit],
    queryFn: () => listAdmissions({ limit }),
    retry: 1,
  });

  return (
    <PanelShell title="IPD Admissions" href="/ipd" icon={BedDoubleIcon} className={className}>
      {query.isLoading ? (
        <PanelLoading />
      ) : query.isError ? (
        <ErrorState error={query.error} />
      ) : query.data?.items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No active admissions.</p>
      ) : (
        <div className="divide-y divide-border">
          {query.data?.items.map((a) => (
            <Row
              key={a.id}
              title={a.patient?.name ?? "Patient"}
              subtitle={`${a.admissionNo} · ${a.ward?.name ?? ""} / ${a.bed?.bedNumber ?? ""}`}
              icon={BedDoubleIcon}
              right={<StatusBadge status={a.status} />}
            />
          ))}
        </div>
      )}
    </PanelShell>
  );
}

// ---------- Ambulance requests ----------

export function AmbulanceRequestsPanel({ limit = 5, className }: { limit?: number; className?: string }) {
  const query = useQuery({
    queryKey: ["dashboard", "panel", "ambulanceRequests", limit],
    queryFn: () => listRequests({ limit }),
    retry: 1,
  });

  return (
    <PanelShell title="Ambulance Requests" href="/ambulance" icon={AmbulanceIcon} className={className}>
      {query.isLoading ? (
        <PanelLoading />
      ) : query.isError ? (
        <ErrorState error={query.error} />
      ) : query.data?.items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No dispatch requests.</p>
      ) : (
        <div className="divide-y divide-border">
          {query.data?.items.map((r) => (
            <Row
              key={r.id}
              title={r.patient?.name ?? "Request"}
              subtitle={<span className="truncate">{r.pickupAddress}</span>}
              icon={AmbulanceIcon}
              right={
                <>
                  <StatusBadge status={r.urgency} />
                  <StatusBadge status={r.status} />
                </>
              }
            />
          ))}
        </div>
      )}
    </PanelShell>
  );
}

// ---------- Recent conversations ----------

export function RecentConversationsPanel({ limit = 4, className }: { limit?: number; className?: string }) {
  const query = useQuery({
    queryKey: ["dashboard", "panel", "conversations", limit],
    queryFn: () => listConversations({ limit }),
    retry: 1,
  });

  return (
    <PanelShell title="Recent Conversations" href="/chat" icon={ActivityIcon} className={className}>
      {query.isLoading ? (
        <PanelLoading />
      ) : query.isError ? (
        <ErrorState error={query.error} />
      ) : query.data?.items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No conversations yet.</p>
      ) : (
        <div className="divide-y divide-border">
          {query.data?.items.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <ActivityIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">
                  {c.title ?? c.participants?.map((p) => p.user?.name).filter(Boolean).join(", ") ?? "Conversation"}
                </span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {new Date(c.createdAt).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </PanelShell>
  );
}

// ---------- Panel registry ----------

export const PANELS: Record<string, React.ComponentType<{ className?: string; limit?: number }>> = {
  appointments: AppointmentsPanel,
  opdQueue: OpdQueuePanel,
  prescriptions: PrescriptionsPanel,
  labOrders: LabOrdersPanel,
  pharmacyQueue: PharmacyQueuePanel,
  inventoryAlerts: InventoryAlertsPanel,
  bills: BillsPanel,
  admissions: AdmissionsPanel,
  ambulanceRequests: AmbulanceRequestsPanel,
  chat: RecentConversationsPanel,
};
