"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { AlertTriangleIcon, CheckIcon, PencilIcon, SparklesIcon, XIcon } from "lucide-react";

import { PageHeader } from "@/shared/components/layout/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/shared/components/ui/select";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { searchPatients } from "@/shared/services/patients.service";
import {
  acceptAiSuggestion, editAiSuggestion, getAiSuggestion, rejectAiSuggestion, suggestAiPrescription,
  type AiSuggestedItem, type AiSuggestionResult,
} from "@/shared/services/clinical.service";
import type { AiPrescriptionSuggestion } from "@/shared/types/domain";

export default function AiPrescriptionsPage() {
  const queryClient = useQueryClient();
  const [patientId, setPatientId] = useState("");
  const [diagnosisText, setDiagnosisText] = useState("");
  const [symptomsText, setSymptomsText] = useState("");
  const [result, setResult] = useState<AiSuggestionResult | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const patients = useQuery({ queryKey: ["patients", "ai-options"], queryFn: () => searchPatients({ limit: 50 }) });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["prescriptions"] });

  // Load a previously generated suggestion by its id (GET /ai-prescriptions/:id).
  const [lookupId, setLookupId] = useState("");
  const lookup = useQuery({
    queryKey: ["ai-prescriptions", "lookup", lookupId],
    queryFn: () => getAiSuggestion(lookupId),
    enabled: lookupId.trim().length > 0,
    retry: false,
  });

  const suggest = useMutation({
    mutationFn: () =>
      suggestAiPrescription({
        patientId,
        diagnosisText,
        symptoms: symptomsText.split(",").map((s) => s.trim()).filter(Boolean),
      }),
    onSuccess: (data) => {
      setResult(data);
      toast.success("Suggestion generated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const accept = useMutation({
    mutationFn: (id: string) => acceptAiSuggestion(id),
    onSuccess: () => {
      toast.success("Suggestion accepted — prescription created");
      setResult(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => rejectAiSuggestion(id, { reason }),
    onSuccess: () => {
      toast.success("Suggestion rejected");
      setRejectOpen(false);
      setRejectReason("");
      setResult(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveEdits = useMutation({
    mutationFn: ({ id, items }: { id: string; items: AiSuggestedItem[] }) =>
      editAiSuggestion(id, {
        items: items.map((i) => ({
          drugId: i.drugId,
          dosage: i.dosage,
          frequency: i.frequency,
          durationDays: i.durationDays,
        })),
      }),
    onSuccess: () => {
      toast.success("Edited suggestion accepted — prescription created");
      setEditOpen(false);
      setResult(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSuggest = patientId && diagnosisText.trim().length >= 10;

  return (
    <div>
      <PageHeader
        title="AI Prescriptions"
        description="Generate a draft prescription from diagnosis text, review the suggestion, then accept, edit, or reject."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Suggest form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><SparklesIcon className="size-4 text-primary" /> Generate suggestion</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <Label className="text-xs">Patient</Label>
              <Select value={patientId} onValueChange={setPatientId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select patient" /></SelectTrigger>
                <SelectContent>
                  {patients.isLoading ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">Loading…</p>
                  ) : (patients.data?.items ?? []).length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">No patients found</p>
                  ) : patients.data?.items.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} · {p.uhid}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Diagnosis text (min 10 chars)</Label>
              <Textarea
                className="mt-1"
                rows={3}
                placeholder="e.g. Acute upper respiratory tract infection with productive cough and low-grade fever."
                value={diagnosisText}
                onChange={(e) => setDiagnosisText(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Symptoms (comma-separated)</Label>
              <Input
                className="mt-1"
                placeholder="fever, cough, sore throat"
                value={symptomsText}
                onChange={(e) => setSymptomsText(e.target.value)}
              />
            </div>
            <Button disabled={!canSuggest || suggest.isPending} onClick={() => suggest.mutate()}>
              {suggest.isPending ? "Generating…" : "Generate suggestion"}
            </Button>
          </CardContent>
        </Card>

        {/* Lookup a past suggestion */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="flex flex-wrap items-end gap-2 p-4">
              <div className="min-w-64 flex-1">
                <Label className="text-xs">Load previous suggestion by ID</Label>
                <Input
                  className="mt-1"
                  placeholder="Paste a suggestion id…"
                  value={lookupId}
                  onChange={(e) => setLookupId(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                disabled={!lookupId.trim() || lookup.isFetching}
                onClick={() => lookup.refetch()}
              >
                {lookup.isFetching ? "Loading…" : "Load suggestion"}
              </Button>
              {lookup.isError && (
                <p className="w-full text-xs text-destructive">
                  Could not load suggestion — check the id.
                </p>
              )}
              {lookup.data && (
                <div className="w-full rounded-md border border-border p-3 text-sm">
                  <p className="font-medium">
                    {lookup.data.patient?.name ?? "Patient"} · {lookup.data.status.replace(/_/g, " ")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{lookup.data.diagnosisText}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {Array.isArray(lookup.data.suggestedItems) ? (lookup.data.suggestedItems as Array<{ drugName?: string; dosage?: string; frequency?: string; durationDays?: number }>).length : 0} item(s) · confidence{" "}
                    {lookup.data.overallConfidence != null ? `${Math.round(lookup.data.overallConfidence * 100)}%` : "—"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Result */}
        <div>
          {!result ? (
            <Card>
              <CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
                <EmptyState
                  icon={SparklesIcon}
                  title="No suggestion yet"
                  description="Fill in the patient and diagnosis, then generate a draft prescription for review."
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="flex items-center gap-2">
                  <SparklesIcon className="size-4 text-primary" />
                  Draft prescription
                  <Badge variant="outline">{Math.round(result.overallConfidence * 100)}% confidence</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {result.context.allergyWarnings.length > 0 || result.context.interactionWarnings.length > 0 ? (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                    <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
                    <div>
                      <p className="font-medium">Review required</p>
                      <p className="text-xs">
                        {result.context.allergyWarnings.length} allergy warning(s), {result.context.interactionWarnings.length} interaction(s) flagged.
                      </p>
                    </div>
                  </div>
                ) : null}

                <div className="divide-y divide-border rounded-md border border-border">
                  {result.suggestedItems.map((item, idx) => (
                    <div key={item.drugId + idx} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div>
                        <p className="text-sm font-medium">{item.drugName}</p>
                        <p className="text-xs text-muted-foreground">{item.dosage} · {item.frequency} · {item.durationDays}d</p>
                        {item.rationale ? <p className="mt-1 text-xs text-muted-foreground">{item.rationale}</p> : null}
                      </div>
                      <span className="text-xs text-muted-foreground">{Math.round(item.confidence * 100)}%</span>
                    </div>
                  ))}
                </div>

                {result.disclaimers.map((d) => (
                  <p key={d} className="text-xs text-muted-foreground">{d}</p>
                ))}

                <div className="flex flex-wrap gap-2">
                  <Button disabled={accept.isPending} onClick={() => accept.mutate(result.id)}>
                    <CheckIcon /> {accept.isPending ? "Accepting…" : "Accept"}
                  </Button>
                  <Button variant="outline" disabled={saveEdits.isPending} onClick={() => setEditOpen(true)}>
                    <PencilIcon /> Edit & accept
                  </Button>
                  <Button variant="ghost" onClick={() => setRejectOpen(true)}>
                    <XIcon /> Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {result && (
        <EditSuggestionDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          items={result.suggestedItems}
          pending={saveEdits.isPending}
          onSubmit={(items) => saveEdits.mutate({ id: result.id, items })}
        />
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject suggestion</DialogTitle>
            <DialogDescription>Optionally note why you&apos;re rejecting this draft.</DialogDescription>
          </DialogHeader>
          <Textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason (optional)" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={reject.isPending} onClick={() => result && reject.mutate({ id: result.id, reason: rejectReason.trim() || undefined })}>
              {reject.isPending ? "Rejecting…" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditSuggestionDialog({
  open, onOpenChange, items, pending, onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: AiSuggestedItem[];
  pending: boolean;
  onSubmit: (items: AiSuggestedItem[]) => void;
}) {
  const [draft, setDraft] = useState<AiSuggestedItem[]>(items);
  const [synced, setSynced] = useState(items);

  if (items !== synced) {
    setSynced(items);
    setDraft(items.map((i) => ({ ...i })));
  }

  const setField = (idx: number, key: "dosage" | "frequency" | "durationDays", value: string) =>
    setDraft((prev) => prev.map((item, i) => (i === idx ? { ...item, [key]: key === "durationDays" ? Number(value) || 0 : value } : item)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit & accept</DialogTitle>
          <DialogDescription>Adjust the draft — accepting creates a prescription from your edits.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {draft.map((item, idx) => (
            <div key={item.drugId + idx} className="grid grid-cols-[1fr_auto_auto] items-end gap-2 rounded-md border border-border p-3">
              <div>
                <Label className="text-xs">{item.drugName}</Label>
                <Input className="mt-1 text-xs" value={item.dosage} onChange={(e) => setField(idx, "dosage", e.target.value)} placeholder="Dosage" />
              </div>
              <div className="w-24">
                <Label className="text-xs">Freq</Label>
                <Input className="mt-1 text-xs" value={item.frequency} onChange={(e) => setField(idx, "frequency", e.target.value)} placeholder="e.g. BD" />
              </div>
              <div className="w-20">
                <Label className="text-xs">Days</Label>
                <Input className="mt-1 text-xs" type="number" min="1" value={String(item.durationDays)} onChange={(e) => setField(idx, "durationDays", e.target.value)} />
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={pending} onClick={() => onSubmit(draft)}>{pending ? "Saving…" : "Accept edits"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
