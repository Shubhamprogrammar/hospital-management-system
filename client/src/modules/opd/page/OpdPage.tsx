"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ClipboardListIcon } from "lucide-react";

import { PageHeader } from "@/shared/components/layout/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Badge } from "@/shared/components/ui/badge";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import {
  getOpdQueue, recordVitals, startConsultation, saveDiagnosis, closeOpdVisit,
} from "@/shared/services/appointments.service";
import { useSession } from "@/shared/lib/auth-client";
import { ROLES, hasRoleAtLeast, type Role } from "@/shared/types";


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
  const isDoctor = hasRoleAtLeast(role, ROLES.DOCTOR);
  const isNurse = hasRoleAtLeast(role, ROLES.NURSE);

  const queue = useQuery({ queryKey: ["opd", "queue"], queryFn: () => getOpdQueue({}) });

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

  return (
    <div>
      <PageHeader
        title="OPD Queue"
        description="Live outpatient queue — record vitals, start consultations, and close visits."
      />

      {queue.isLoading ? (
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
                  <VitalsForm disabled={!isNurse && !isDoctor} onSubmit={(values) => vitals.mutate({ visitId: entry.visit.id, values })} />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {isDoctor && entry.visit.status === "VITALS_DONE" && (
                    <Button size="sm" onClick={() => start.mutate(entry.visit.id)}>Start consultation</Button>
                  )}
                  {isDoctor && entry.visit.status === "IN_CONSULTATION" && (
                    <DiagnosisInput onSubmit={(icd10) => diagnosis.mutate({ id: entry.visit.id, icd10 })} />
                  )}
                  {isDoctor && (entry.visit.status === "IN_CONSULTATION" || entry.visit.status === "VITALS_DONE") && (
                    <Button size="sm" variant="outline" onClick={() => close.mutate(entry.visit.id)}>Close visit</Button>
                  )}
                  {entry.visit.vitals && entry.visit.vitals.length > 0 && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      Last vitals: BP {entry.visit.vitals[entry.visit.vitals.length - 1].bpSystolic}/{entry.visit.vitals[entry.visit.vitals.length - 1].bpDiastolic}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
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
