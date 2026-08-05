"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Building2Icon, ClipboardListIcon } from "lucide-react";

import { PageHeader } from "@/shared/components/layout/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Badge } from "@/shared/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/shared/components/ui/dialog";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import { StatusBadge } from "@/shared/components/feedback/StatusBadge";
import {
  getOpdQueue, getOpdVisit, recordVitals, startConsultation, saveDiagnosis, closeOpdVisit, referToIpd,
} from "@/shared/services/appointments.service";
import { listDepartments } from "@/shared/services/org.service";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { toLocalDate } from "@/shared/lib/utils";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/shared/lib/auth-client";
import { hasRole, ROLES, type Role } from "@/shared/types";


const VITALS_FIELDS: Array<{ key: string; label: string; type: string; step?: string }> = [
  { key: "bpSystolic", label: "BP Systolic", type: "number" },
  { key: "bpDiastolic", label: "BP Diastolic", type: "number" },
  { key: "pulse", label: "Pulse", type: "number" },
  { key: "temperature", label: "Temp (°C)", type: "number", step: "0.1" },
  { key: "spo2", label: "SpO2", type: "number" },
  { key: "weight", label: "Weight (kg)", type: "number", step: "0.1" },
  { key: "height", label: "Height (cm)", type: "number" },
];

export default function OpdPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const role = session?.user?.role as Role | undefined;
  // Strict role gating (matches the backend opd routes): vitals can be
  // recorded by NURSE/DOCTOR (+admins); consultation actions are
  // SUPER_ADMIN/DOCTOR only.
  const canRecordVitals = hasRole(role, ROLES.NURSE, ROLES.DOCTOR, ROLES.SUPER_ADMIN, ROLES.HOSPITAL_ADMIN);
  // Consultation + "Refer to IPD" actions mirror the backend opd routes
  // (SUPER_ADMIN/DOCTOR only).
  const canConsult = hasRole(role, ROLES.DOCTOR, ROLES.SUPER_ADMIN);

  // The queue endpoint requires departmentId + date (the dashboard already
  // passes them). Read them from the URL so deep links work, and default to
  // today + the first active department when they are absent.
  const departments = useQuery({
    queryKey: ["departments", "options"],
    queryFn: () => listDepartments({ limit: 100, isActive: true }),
  });

  const searchParams = useSearchParams();
  const router = useRouter();
  const urlDepartmentId = searchParams.get("departmentId") ?? "";
  const rawDate = searchParams.get("date") ?? "";
  const urlDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : "";

  const selectedDepartmentId =
    departments.data?.items.some((d) => d.id === urlDepartmentId)
      ? urlDepartmentId
      : departments.data?.items[0]?.id;
  const selectedDate = urlDate || toLocalDate(new Date());

  const updateParams = (patch: { departmentId?: string; date?: string }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (patch.departmentId !== undefined) {
      if (patch.departmentId) params.set("departmentId", patch.departmentId);
      else params.delete("departmentId");
    }
    if (patch.date !== undefined) {
      if (patch.date) params.set("date", patch.date);
      else params.delete("date");
    }
    const qs = params.toString();
    router.replace(qs ? `/opd?${qs}` : "/opd", { scroll: false });
  };

  const queue = useQuery({
    queryKey: ["opd", "queue", selectedDepartmentId, selectedDate],
    queryFn: () => getOpdQueue({ departmentId: selectedDepartmentId!, date: selectedDate }),
    enabled: !!selectedDepartmentId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["opd"] });

  const vitals = useMutation({
    mutationFn: ({ visitId, values }: { visitId: string; values: Record<string, number> }) => recordVitals(visitId, values),
    onSuccess: () => { toast.success("Vitals recorded"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const start = useMutation({
    mutationFn: (id: string) => startConsultation(id),
    onSuccess: () => { toast.success("Consultation started"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const diagnosis = useMutation({
    mutationFn: ({ id, icd10 }: { id: string; icd10: string }) => saveDiagnosis(id, { icd10Code: icd10 }),
    onSuccess: () => { toast.success("Diagnosis saved"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const close = useMutation({
    mutationFn: (id: string) => closeOpdVisit(id),
    onSuccess: () => { toast.success("Visit closed"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const referIpd = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => referToIpd(id, { reason: reason || undefined }),
    onSuccess: (result) => {
      toast.success("Patient referred to IPD");
      if (result?.admissionId) {
        toast(`Admission ${result.admissionId.slice(0, 8)} created`, { icon: "🛏️" });
      }
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [detailFor, setDetailFor] = useState<{ id: string; name: string } | null>(null);
  const visitDetail = useQuery({
    queryKey: ["opd", "visit", detailFor?.id],
    queryFn: () => getOpdVisit(detailFor!.id),
    enabled: !!detailFor,
  });

  return (
    <div>
      <PageHeader
        title="OPD Queue"
        description="Live outpatient queue — record vitals, start consultations, and close visits."
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="flex items-center gap-2">
            <Label className="shrink-0 text-xs font-medium text-muted-foreground">Department</Label>
            <Select value={selectedDepartmentId ?? ""} onValueChange={(v) => updateParams({ departmentId: v })}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>
                {departments.data?.items.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="shrink-0 text-xs font-medium text-muted-foreground">Date</Label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => updateParams({ date: e.target.value })}
              className="w-44"
            />
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            {queue.data ? `${queue.data.length} waiting` : departments.isLoading ? "Loading…" : "No queue data"}
          </div>
        </CardContent>
      </Card>

      {!selectedDepartmentId ? (
        departments.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : (
          <EmptyState
            icon={Building2Icon}
            title="No active departments"
            description="Create an active department to view its OPD queue."
          />
        )
      ) : queue.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : queue.isError ? (
        <ErrorState error={queue.error} onRetry={() => queue.refetch()} />
      ) : queue.data?.length === 0 ? (
        <EmptyState icon={ClipboardListIcon} title="Queue is empty" description="Checked-in patients will appear here." />
      ) : (
        <div className="space-y-4">
          {queue.data?.map((entry) => (
            <Card key={entry.visit.id}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                      {entry.position}
                    </div>
                    <div>
                      <p className="font-medium">{entry.visit.patient?.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{entry.visit.patient?.uhid} · Token {entry.visit.tokenNumber}</p>
                    </div>
                  </div>
                  <Badge variant="outline">{entry.visit.status.replace(/_/g, " ")}</Badge>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <VitalsForm disabled={!canRecordVitals} onSubmit={(values) => vitals.mutate({ visitId: entry.visit.id, values })} />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {canConsult && entry.visit.status === "VITALS_DONE" && (
                    <Button size="sm" onClick={() => start.mutate(entry.visit.id)}>Start consultation</Button>
                  )}
                  {canConsult && entry.visit.status === "IN_CONSULTATION" && (
                    <DiagnosisInput onSubmit={(icd10) => diagnosis.mutate({ id: entry.visit.id, icd10 })} />
                  )}
                  {canConsult && (entry.visit.status === "IN_CONSULTATION" || entry.visit.status === "VITALS_DONE") && (
                    <Button size="sm" variant="outline" onClick={() => close.mutate(entry.visit.id)}>Close visit</Button>
                  )}
                  {canConsult && entry.visit.status === "IN_CONSULTATION" && (
                    <ReferIpdButton
                      pending={referIpd.isPending}
                      onSubmit={(reason) => referIpd.mutate({ id: entry.visit.id, reason })}
                    />
                  )}
                  {entry.visit.vitals && entry.visit.vitals.length > 0 && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      Last vitals: BP {entry.visit.vitals[entry.visit.vitals.length - 1].bpSystolic}/{entry.visit.vitals[entry.visit.vitals.length - 1].bpDiastolic}
                    </span>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setDetailFor({ id: entry.visit.id, name: entry.visit.patient?.name ?? "" })}>
                    View visit
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Visit detail dialog */}
      <Dialog open={!!detailFor} onOpenChange={(o) => !o && setDetailFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>OPD visit</DialogTitle>
            <DialogDescription>{detailFor?.name}</DialogDescription>
          </DialogHeader>
          {visitDetail.isLoading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : visitDetail.isError ? (
            <ErrorState error={visitDetail.error} onRetry={() => visitDetail.refetch()} />
          ) : visitDetail.data ? (
            <div className="flex flex-col gap-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-muted-foreground">Token</p><p className="font-medium">{visitDetail.data.tokenNumber}</p></div>
                <div><p className="text-muted-foreground">Status</p><StatusBadge status={visitDetail.data.status} /></div>
                <div><p className="text-muted-foreground">Doctor</p><p className="font-medium">{visitDetail.data.doctor?.name ?? "—"}</p></div>
                <div><p className="text-muted-foreground">Department</p><p className="font-medium">{visitDetail.data.department?.name ?? "—"}</p></div>
              </div>
              <div>
                <p className="mb-2 text-muted-foreground">Vitals</p>
                {visitDetail.data.vitals?.length ? (
                  <div className="space-y-1.5">
                    {visitDetail.data.vitals.map((v) => (
                      <p key={v.id} className="text-xs text-muted-foreground">
                        BP {v.bpSystolic ?? "—"}/{v.bpDiastolic ?? "—"} · Pulse {v.pulse ?? "—"} · Temp {v.temperature ?? "—"}°C · SpO2 {v.spo2 ?? "—"}% · {new Date(v.recordedAt).toLocaleString()}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No vitals recorded.</p>
                )}
              </div>
              <div>
                <p className="mb-2 text-muted-foreground">Diagnoses</p>
                {visitDetail.data.diagnoses?.length ? (
                  <div className="space-y-1.5">
                    {visitDetail.data.diagnoses.map((d) => (
                      <p key={d.id} className="text-sm"><code className="rounded bg-muted px-1.5 py-0.5 text-xs">{d.icd10Code}</code> {d.description ?? ""}</p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No diagnoses yet.</p>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VitalsForm({ disabled, onSubmit }: { disabled: boolean; onSubmit: (v: Record<string, number>) => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  if (disabled) return null;

  const submit = () => {
    const parsed: Record<string, number> = {};
    for (const field of VITALS_FIELDS) {
      const raw = values[field.key];
      if (raw && raw.trim() !== "") parsed[field.key] = Number(raw);
    }
    onSubmit(parsed);
  };

  return (
    <div className="col-span-3 flex flex-wrap items-end gap-2">
      {VITALS_FIELDS.map((field) => (
        <div key={field.key} className="w-24">
          <Label className="text-xs">{field.label}</Label>
          <Input
            type="number"
            step={field.step}
            className="mt-1 h-8"
            value={values[field.key] ?? ""}
            onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
          />
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={submit}>Record vitals</Button>
    </div>
  );
}

function ReferIpdButton({ pending, onSubmit }: { pending: boolean; onSubmit: (reason?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Refer to IPD</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold">Refer to IPD</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Creates an in-patient admission for this patient.</p>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional)"
              className="mt-4 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button disabled={pending} onClick={() => { onSubmit(reason.trim() || undefined); setOpen(false); }}>
                {pending ? "Referring…" : "Refer to IPD"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DiagnosisInput({ onSubmit }: { onSubmit: (icd10: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="flex items-center gap-2">
      <Input placeholder="ICD-10 code" value={value} onChange={(e) => setValue(e.target.value)} className="h-8 w-40" />
      <Button size="sm" variant="outline" disabled={!value} onClick={() => { onSubmit(value); setValue(""); }}>
        Save diagnosis
      </Button>
    </div>
  );
}
