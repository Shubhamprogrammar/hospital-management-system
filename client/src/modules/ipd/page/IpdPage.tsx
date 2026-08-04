"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { BedDoubleIcon, FileTextIcon, PlusIcon } from "lucide-react";
import { admitSchema, type AdmitValues } from "@/modules/ipd/constant/schemas";

import { PageHeader } from "@/shared/components/layout/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/shared/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/shared/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/shared/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/shared/components/ui/form";
import { PaginationBar } from "@/shared/components/ui/pagination";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import { StatusBadge } from "@/shared/components/feedback/StatusBadge";
import { useListQuery } from "@/shared/lib/hooks/useListQuery";
import {
  addIpdRound, admitPatient, chartIpdVitals, dischargePatient, getAdmission, getDischargeSummary,
  listAdmissions, listBeds, listWards, transferAdmission,
} from "@/shared/services/ipd.service";
import { searchPatients } from "@/shared/services/patients.service";
import { listDoctors } from "@/shared/services/org.service";
import type { DischargeSummary, IpdAdmission } from "@/shared/types/domain";

type ActionType = "ROUNDS" | "VITALS" | "TRANSFER";

const VITALS_FIELDS = [
  { key: "bpSystolic", label: "BP systolic" },
  { key: "bpDiastolic", label: "BP diastolic" },
  { key: "pulse", label: "Pulse" },
  { key: "temperature", label: "Temp (°C)" },
  { key: "spo2", label: "SpO2" },
  { key: "weight", label: "Weight (kg)" },
] as const;

export default function IpdPage() {
  const queryClient = useQueryClient();
  const [admitOpen, setAdmitOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [actionFor, setActionFor] = useState<{ admission: IpdAdmission; action: ActionType } | null>(null);
  const [summaryFor, setSummaryFor] = useState<IpdAdmission | null>(null);
  const [detailFor, setDetailFor] = useState<IpdAdmission | null>(null);

  const admissionDetail = useQuery({
    queryKey: ["ipd", "detail", detailFor?.id],
    queryFn: () => getAdmission(detailFor!.id),
    enabled: !!detailFor,
  });

  const list = useListQuery<IpdAdmission>({
    queryKey: ["ipd", statusFilter],
    queryFn: (params) => listAdmissions({ ...params, status: statusFilter || undefined }),
  });

  const patients = useQuery({ queryKey: ["patients", "options"], queryFn: () => searchPatients({ limit: 50 }) });
  const doctors = useQuery({ queryKey: ["doctors", "options"], queryFn: () => listDoctors({ limit: 50 }) });
  const wards = useQuery({ queryKey: ["wards", "options"], queryFn: () => listWards({ limit: 50 }) });
  const beds = useQuery({ queryKey: ["beds", "available"], queryFn: () => listBeds({ limit: 50, status: "AVAILABLE" }) });

  const form = useForm<AdmitValues>({
    resolver: zodResolver(admitSchema),
    defaultValues: { patientId: "", admittingDoctorId: "", wardId: "", bedId: "", admissionType: "REFERRAL" },
  });

  const admit = useMutation({
    mutationFn: (v: AdmitValues) => admitPatient(v),
    onSuccess: () => {
      toast.success("Patient admitted");
      setAdmitOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["ipd"] });
      queryClient.invalidateQueries({ queryKey: ["beds"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const discharge = useMutation({
    mutationFn: (id: string) => dischargePatient(id, {}),
    onSuccess: () => {
      toast.success("Patient discharged");
      queryClient.invalidateQueries({ queryKey: ["ipd"] });
      queryClient.invalidateQueries({ queryKey: ["beds"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["ipd"] });
    queryClient.invalidateQueries({ queryKey: ["beds"] });
  };

  const round = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) => addIpdRound(id, { notes }),
    onSuccess: () => { toast.success("Round recorded"); setActionFor(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const vitals = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Record<string, number> }) => chartIpdVitals(id, values),
    onSuccess: () => { toast.success("Vitals charted"); setActionFor(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const transfer = useMutation({
    mutationFn: ({ id, toBedId, reason }: { id: string; toBedId: string; reason?: string }) =>
      transferAdmission(id, { toBedId, reason: reason || undefined }),
    onSuccess: () => { toast.success("Admission transferred"); setActionFor(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const summary = useQuery({
    queryKey: ["ipd", "summary", summaryFor?.id],
    queryFn: () => getDischargeSummary(summaryFor!.id),
    enabled: !!summaryFor,
  });

  return (
    <div>
      <PageHeader
        title="IPD Admissions"
        description="In-patient admissions, rounds, vitals, transfers, and discharges."
        actions={<Button onClick={() => setAdmitOpen(true)}><PlusIcon /> Admit patient</Button>}
      />

      <div className="mb-4">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === "ALL" ? "" : v)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {["ADMITTED", "IN_TREATMENT", "DISCHARGE_PLANNED", "DISCHARGED"].map((s) => (
              <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-card">
        {list.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
          </div>
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data?.items.length === 0 ? (
          <EmptyState icon={BedDoubleIcon} title="No admissions" description="Admit a patient to get started." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Admission No.</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead>Ward / Bed</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.items.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs">{a.admissionNo}</TableCell>
                  <TableCell>
                    <p className="font-medium">{a.patient?.name ?? "—"}</p>
                    <p className="font-mono text-xs text-muted-foreground">{a.patient?.uhid}</p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{a.admittingDoctor?.name ?? "—"}</TableCell>
                  <TableCell>{a.ward?.name ?? "—"} / {a.bed?.bedNumber ?? "—"}</TableCell>
                  <TableCell>{a.admissionType.replace(/_/g, " ")}</TableCell>
                  <TableCell><StatusBadge status={a.status} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => setDetailFor(a)}>Details</Button>
                      {a.status !== "DISCHARGED" ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setActionFor({ admission: a, action: "ROUNDS" })}>Rounds</Button>
                          <Button size="sm" variant="outline" onClick={() => setActionFor({ admission: a, action: "VITALS" })}>Vitals</Button>
                          <Button size="sm" variant="outline" onClick={() => setActionFor({ admission: a, action: "TRANSFER" })}>Transfer</Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => discharge.mutate(a.id)}>Discharge</Button>
                        </>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setSummaryFor(a)}>
                          <FileTextIcon /> Summary
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <div className="p-4">
          <PaginationBar meta={list.meta} onPageChange={list.setPage} />
        </div>
      </div>

      <Dialog open={admitOpen} onOpenChange={setAdmitOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Admit patient</DialogTitle>
            <DialogDescription>Assign a patient to a ward bed.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => admit.mutate(v))} className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="patientId" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Patient</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {patients.data?.items.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.uhid})</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="admittingDoctorId" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Admitting doctor</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {doctors.data?.items.map((d) => <SelectItem key={d.id} value={d.id}>{d.user?.name} — {d.specialization}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="wardId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Ward</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select ward" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {wards.data?.items.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="bedId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Bed</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select bed" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {beds.data?.items.map((b) => <SelectItem key={b.id} value={b.id}>{b.ward?.name} — {b.bedNumber}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="admissionType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Admission type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="EMERGENCY">Emergency</SelectItem>
                      <SelectItem value="REFERRAL">Referral</SelectItem>
                      <SelectItem value="DIRECT">Direct</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter className="col-span-2">
                <Button type="submit" disabled={admit.isPending}>{admit.isPending ? "Admitting…" : "Admit patient"}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Rounds / Vitals / Transfer actions */}
      <Dialog open={!!actionFor} onOpenChange={(o) => !o && setActionFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionFor?.action === "ROUNDS" && "Record round"}
              {actionFor?.action === "VITALS" && "Chart vitals"}
              {actionFor?.action === "TRANSFER" && "Transfer admission"}
            </DialogTitle>
            <DialogDescription>
              {actionFor?.admission.patient?.name} · {actionFor?.admission.admissionNo}
            </DialogDescription>
          </DialogHeader>
          {actionFor?.action === "ROUNDS" && (
            <RoundsForm pending={round.isPending} onSubmit={(notes) => actionFor && round.mutate({ id: actionFor.admission.id, notes })} />
          )}
          {actionFor?.action === "VITALS" && (
            <VitalsForm pending={vitals.isPending} onSubmit={(values) => actionFor && vitals.mutate({ id: actionFor.admission.id, values })} />
          )}
          {actionFor?.action === "TRANSFER" && (
            <TransferForm
              currentBed={actionFor?.admission.bed?.bedNumber}
              beds={beds.data?.items ?? []}
              pending={transfer.isPending}
              onSubmit={(toBedId, reason) => actionFor && transfer.mutate({ id: actionFor.admission.id, toBedId, reason })}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Admission detail dialog */}
      <Dialog open={!!detailFor} onOpenChange={(o) => !o && setDetailFor(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Admission detail</DialogTitle>
            <DialogDescription>{detailFor?.patient?.name} · {detailFor?.admissionNo}</DialogDescription>
          </DialogHeader>
          {admissionDetail.isLoading ? (
            <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : admissionDetail.isError ? (
            <ErrorState error={admissionDetail.error} onRetry={() => admissionDetail.refetch()} />
          ) : admissionDetail.data ? (
            <div className="flex flex-col gap-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-muted-foreground">Admitted</p><p className="font-medium">{new Date(admissionDetail.data.admittedAt).toLocaleString()}</p></div>
                <div><p className="text-muted-foreground">Status</p><StatusBadge status={admissionDetail.data.status} /></div>
                <div><p className="text-muted-foreground">Ward / Bed</p><p className="font-medium">{admissionDetail.data.ward?.name ?? "—"} / {admissionDetail.data.bed?.bedNumber ?? "—"}</p></div>
                <div><p className="text-muted-foreground">Doctor</p><p className="font-medium">{admissionDetail.data.admittingDoctor?.name ?? "—"}</p></div>
              </div>
              <div>
                <p className="mb-2 text-muted-foreground">Rounds ({admissionDetail.data.rounds?.length ?? 0})</p>
                {admissionDetail.data.rounds?.length ? (
                  <div className="space-y-1.5">
                    {admissionDetail.data.rounds.map((r) => (
                      <p key={r.id} className="rounded-md bg-muted/50 px-3 py-2 text-xs">
                        <span className="font-medium">{r.doctor?.name ?? "Doctor"}</span> · {new Date(r.createdAt).toLocaleString()}
                        <span className="block text-muted-foreground">{r.notes}</span>
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No rounds recorded.</p>
                )}
              </div>
              <div>
                <p className="mb-2 text-muted-foreground">Vitals ({admissionDetail.data.vitals?.length ?? 0})</p>
                {admissionDetail.data.vitals?.length ? (
                  <div className="space-y-1.5">
                    {admissionDetail.data.vitals.map((v) => (
                      <p key={v.id} className="text-xs text-muted-foreground">
                        BP {v.bpSystolic ?? "—"}/{v.bpDiastolic ?? "—"} · Pulse {v.pulse ?? "—"} · Temp {v.temperature ?? "—"}°C · SpO2 {v.spo2 ?? "—"}% · {new Date(v.recordedAt).toLocaleString()}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No vitals charted.</p>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Discharge summary */}
      <Dialog open={!!summaryFor} onOpenChange={(o) => !o && setSummaryFor(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Discharge summary</DialogTitle>
            <DialogDescription>{summaryFor?.patient?.name} · {summaryFor?.admissionNo}</DialogDescription>
          </DialogHeader>
          {summary.isLoading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : summary.isError ? (
            <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
          ) : summary.data ? (
            <DischargeSummaryView summary={summary.data} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RoundsForm({ pending, onSubmit }: { pending: boolean; onSubmit: (notes: string) => void }) {
  const [notes, setNotes] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (notes.trim()) onSubmit(notes.trim()); }} className="flex flex-col gap-4">
      <div className="grid gap-1.5">
        <Label className="text-xs">Round notes</Label>
        <textarea
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Clinical findings, progress, plan…"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending || !notes.trim()}>{pending ? "Saving…" : "Record round"}</Button>
      </DialogFooter>
    </form>
  );
}

function VitalsForm({ pending, onSubmit }: { pending: boolean; onSubmit: (values: Record<string, number>) => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const submit = () => {
    const parsed: Record<string, number> = {};
    for (const f of VITALS_FIELDS) {
      if (values[f.key]?.trim()) parsed[f.key] = Number(values[f.key]);
    }
    if (Object.keys(parsed).length > 0) onSubmit(parsed);
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {VITALS_FIELDS.map((f) => (
          <div key={f.key}>
            <Label className="text-xs">{f.label}</Label>
            <Input
              type="number"
              step="0.1"
              className="mt-1 h-8"
              value={values[f.key] ?? ""}
              onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <DialogFooter>
        <Button disabled={pending} onClick={submit}>{pending ? "Saving…" : "Chart vitals"}</Button>
      </DialogFooter>
    </div>
  );
}

function TransferForm({
  currentBed, beds, pending, onSubmit,
}: {
  currentBed?: string;
  beds: Array<{ id: string; bedNumber: string; ward?: { name: string } | null }>;
  pending: boolean;
  onSubmit: (toBedId: string, reason?: string) => void;
}) {
  const [toBedId, setToBedId] = useState("");
  const [reason, setReason] = useState("");
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Current bed: {currentBed ?? "—"}. Choose an available bed to transfer to.</p>
      <div>
        <Label className="text-xs">Destination bed</Label>
        <Select value={toBedId} onValueChange={setToBedId}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Select available bed" /></SelectTrigger>
          <SelectContent>
            {beds.map((b) => <SelectItem key={b.id} value={b.id}>{b.ward?.name ?? ""} — {b.bedNumber}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Reason (optional)</Label>
        <Input className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <DialogFooter>
        <Button disabled={pending || !toBedId} onClick={() => onSubmit(toBedId, reason.trim() || undefined)}>
          {pending ? "Transferring…" : "Transfer"}
        </Button>
      </DialogFooter>
    </div>
  );
}

function DischargeSummaryView({ summary }: { summary: DischargeSummary }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-muted-foreground">Diagnosis</p>
          <p className="font-medium">{summary.diagnosis}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Signed by</p>
          <p className="font-medium">{summary.signedBy}</p>
        </div>
      </div>
      <div>
        <p className="mb-1 text-muted-foreground">Treatment summary</p>
        <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-3">{summary.treatmentSummary}</p>
      </div>
      <div>
        <p className="mb-1 text-muted-foreground">Follow-up instructions</p>
        <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-3">{summary.followUpInstructions}</p>
      </div>
      {summary.s3Key && <p className="text-xs text-muted-foreground">PDF: {summary.s3Key}</p>}
    </div>
  );
}
