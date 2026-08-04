"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ArrowLeftRightIcon, PillIcon, RotateCcwIcon } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Card, CardContent } from "@/shared/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/shared/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import { StatusBadge } from "@/shared/components/feedback/StatusBadge";
import {
  createDispense, listDispenses, listDrugs, processReturn, recordSubstitution,
  suggestBatches, type BatchSuggestion, type DrugCatalogEntry,
} from "@/shared/services/pharmacy.service";
import { useSession } from "@/shared/lib/auth-client";
import { ROLES, hasRole, type Role } from "@/shared/types";
import type { Prescription, PrescriptionItem } from "@/shared/types/domain";

export default function PharmacyPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const role = session?.user?.role as Role | undefined;
  const isPharmacist = hasRole(role, ROLES.PHARMACIST);

  const queue = useQuery({ queryKey: ["pharmacy", "queue"], queryFn: () => getQueue() });
  const dispenses = useQuery({ queryKey: ["pharmacy", "dispenses"], queryFn: () => listDispenses({ limit: 30 }) });

  const [dispenseFor, setDispenseFor] = useState<Prescription | null>(null);
  const [substituteFor, setSubstituteFor] = useState<{ dispenseId: string; item: DispenseItemLike } | null>(null);
  const [returnFor, setReturnFor] = useState<{ dispenseId: string; item: DispenseItemLike } | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["pharmacy"] });
    queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
  };

  const dispense = useMutation({
    mutationFn: (input: { prescriptionId: string; items: Array<{ prescriptionItemId: string; drugId: string; batchId?: string; quantityDispensed: number }> }) =>
      createDispense(input),
    onSuccess: () => {
      toast.success("Dispense recorded");
      setDispenseFor(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const substitute = useMutation({
    mutationFn: ({ dispenseId, input }: { dispenseId: string; input: { dispenseItemId: string; substitutedFromDrugId: string; reason: string } }) =>
      recordSubstitution(dispenseId, input),
    onSuccess: () => {
      toast.success("Substitution recorded");
      setSubstituteFor(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ret = useMutation({
    mutationFn: (input: { dispenseItemId: string; quantityReturned: number; reason: string }) => processReturn(input),
    onSuccess: () => {
      toast.success("Return processed — stock restocked");
      setReturnFor(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader title="Pharmacy" description="Dispensing queue, recent dispenses, substitutions, and returns." />

      <Tabs defaultValue="queue">
        <TabsList className="mb-4">
          <TabsTrigger value="queue">Dispensing queue</TabsTrigger>
          <TabsTrigger value="dispenses">Recent dispenses</TabsTrigger>
        </TabsList>

        <TabsContent value="queue">
          {queue.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
          ) : queue.isError ? (
            <ErrorState error={queue.error} onRetry={() => queue.refetch()} />
          ) : (queue.data ?? []).length === 0 ? (
            <EmptyState icon={PillIcon} title="Dispensing queue is empty" description="Prescriptions awaiting dispensing appear here." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {queue.data?.map((entry) => (
                <Card key={entry.prescription.id}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{entry.prescription.patient?.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {entry.prescription.doctor?.name} · {new Date(entry.prescription.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <StatusBadge status={entry.prescription.status} />
                    </div>
                    <div className="mt-3 space-y-1.5">
                      {entry.prescription.items?.map((item) => (
                        <div key={item.id} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-1.5 text-sm">
                          <span>{item.drug?.name ?? "Drug"}</span>
                          <span className="text-xs text-muted-foreground">
                            {item.dosage} · {item.frequency} · {item.durationDays}d
                          </span>
                        </div>
                      ))}
                    </div>
                    {isPharmacist && (entry.prescription.status === "ACTIVE" || entry.prescription.status === "PARTIALLY_DISPENSED") && (
                      <Button size="sm" className="mt-4 w-full" onClick={() => setDispenseFor(entry.prescription)}>
                        Start dispense
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="dispenses">
          {dispenses.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
          ) : dispenses.isError ? (
            <ErrorState error={dispenses.error} onRetry={() => dispenses.refetch()} />
          ) : (dispenses.data?.items ?? []).length === 0 ? (
            <EmptyState icon={PillIcon} title="No dispenses yet" description="Recorded dispensations appear here — substitute or process returns from this list." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {dispenses.data?.items.map((d) => (
                <Card key={d.id}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{d.prescription?.patient?.name ?? "Patient"}</p>
                        <p className="text-xs text-muted-foreground">
                          {d.id.slice(0, 8)} · {new Date(d.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <StatusBadge status={d.status} />
                    </div>
                    <div className="mt-3 space-y-1.5">
                      {(d.items ?? []).map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-1.5 text-sm">
                          <div className="min-w-0">
                            <span className="font-medium">{item.drug?.name ?? "Drug"}</span>
                            {item.substitutedFromDrug && (
                              <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">← {item.substitutedFromDrug.name}</span>
                            )}
                            <span className="ml-2 text-xs text-muted-foreground">
                              {item.quantityDispensed}× · {item.batch?.batchNo ?? "no batch"}
                            </span>
                          </div>
                          {isPharmacist && (
                            <div className="flex shrink-0 gap-1">
                              <Button size="sm" variant="outline" onClick={() => setSubstituteFor({ dispenseId: d.id, item })}>
                                <ArrowLeftRightIcon /> Substitute
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setReturnFor({ dispenseId: d.id, item })}>
                                <RotateCcwIcon /> Return
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <DispenseDialog
        prescription={dispenseFor}
        pending={dispense.isPending}
        onClose={() => setDispenseFor(null)}
        onSubmit={(input) => dispense.mutate(input)}
      />

      {substituteFor && (
        <SubstituteDialog
          item={substituteFor.item}
          pending={substitute.isPending}
          onClose={() => setSubstituteFor(null)}
          onSubmit={(input) => substitute.mutate({ dispenseId: substituteFor.dispenseId, input })}
        />
      )}

      {returnFor && (
        <ReturnDialog
          item={returnFor.item}
          pending={ret.isPending}
          onClose={() => setReturnFor(null)}
          onSubmit={(input) => ret.mutate(input)}
        />
      )}
    </div>
  );
}

async function getQueue() {
  const { getPharmacyQueue } = await import("@/shared/services/pharmacy.service");
  return getPharmacyQueue({});
}

// Loose view type for dispense line items (backend returns extra fields like `returns`).
interface DispenseItemLike {
  id: string;
  drug?: { id: string; name: string } | null;
  batch?: { id: string; batchNo: string } | null;
  quantityDispensed: number;
  substitutedFromDrug?: { id: string; name: string } | null;
  returns?: Array<{ quantityReturned: number }>;
}

// ---------- Dispense dialog ----------

function DispenseDialog({
  prescription, pending, onClose, onSubmit,
}: {
  prescription: Prescription | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: { prescriptionId: string; items: Array<{ prescriptionItemId: string; drugId: string; batchId?: string; quantityDispensed: number }> }) => void;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [batchChoices, setBatchChoices] = useState<Record<string, string>>({});
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  const key = prescription?.id ?? null;

  // Fetch FEFO batch suggestions for every item when the dialog opens.
  const suggestions = useQuery({
    queryKey: ["pharmacy", "suggest", prescription?.id],
    queryFn: async () => {
      const entries = await Promise.all(
        (prescription?.items ?? []).map(async (item) => {
          const qty = quantities[item.id] ?? item.durationDays;
          const res = await suggestBatches({ drugId: item.drugId, quantity: qty });
          return { itemId: item.id, res };
        }),
      );
      return Object.fromEntries(entries.map((e) => [e.itemId, e.res]));
    },
    enabled: !!prescription,
  });

  if (key !== syncedKey) {
    setSyncedKey(key);
    setQuantities({});
    setBatchChoices({});
  }

  const items = prescription?.items ?? [];
  const ready = items.length > 0 && items.every((it) => (quantities[it.id] ?? it.durationDays) > 0);

  const submit = () => {
    if (!prescription || !ready) return;
    onSubmit({
      prescriptionId: prescription.id,
      items: items.map((it) => ({
        prescriptionItemId: it.id,
        drugId: it.drugId,
        quantityDispensed: quantities[it.id] ?? it.durationDays,
        batchId: batchChoices[it.id] || undefined,
      })),
    });
  };

  return (
    <Dialog open={!!prescription} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Start dispense</DialogTitle>
          <DialogDescription>
            {prescription?.patient?.name} · adjust quantities and pick FEFO batches per item.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-96 space-y-3 overflow-y-auto">
          {items.map((item) => (
            <DispenseItemRow
              key={item.id}
              item={item}
              quantity={quantities[item.id] ?? item.durationDays}
              suggestion={suggestions.data?.[item.id]}
              batchChoice={batchChoices[item.id]}
              loading={suggestions.isLoading}
              onQuantity={(q) => setQuantities((prev) => ({ ...prev, [item.id]: q }))}
              onBatch={(b) => setBatchChoices((prev) => ({ ...prev, [item.id]: b }))}
            />
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={pending || !ready || suggestions.isLoading} onClick={submit}>
            {pending ? "Dispensing…" : "Confirm dispense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DispenseItemRow({
  item, quantity, suggestion, batchChoice, loading, onQuantity, onBatch,
}: {
  item: PrescriptionItem;
  quantity: number;
  suggestion?: BatchSuggestion;
  batchChoice?: string;
  loading: boolean;
  onQuantity: (q: number) => void;
  onBatch: (batchId: string) => void;
}) {
  const prescribed = item.durationDays;
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{item.drug?.name ?? "Drug"}</p>
          <p className="text-xs text-muted-foreground">{item.dosage} · {item.frequency} · prescribed {prescribed}</p>
        </div>
        <div className="flex w-32 items-center gap-1.5">
          <Label className="text-xs">Qty</Label>
          <Input
            type="number"
            min={1}
            max={prescribed}
            className="h-8"
            value={String(quantity)}
            onChange={(e) => onQuantity(Math.min(prescribed, Math.max(1, Number(e.target.value) || 1)))}
          />
        </div>
      </div>
      <div className="mt-2">
        {loading ? (
          <Skeleton className="h-8 w-full" />
        ) : suggestion?.fefo.length ? (
          <Select value={batchChoice ?? ""} onValueChange={onBatch}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={suggestion.fullyCovered ? "Pick batch (FEFO)" : "Stock insufficient — dispense without batch"} /></SelectTrigger>
            <SelectContent>
              {suggestion.fefo.map((b) => (
                <SelectItem key={b.batchId} value={b.batchId}>
                  {b.batchNo} · exp {new Date(b.expiryDate).toLocaleDateString()} · {b.available} available
                </SelectItem>
              ))}
              <SelectItem value="__none__">No batch</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <p className="text-xs text-muted-foreground">No expiring stock found for this drug — dispensing without batch.</p>
        )}
      </div>
    </div>
  );
}

// ---------- Substitute dialog ----------

function SubstituteDialog({
  item, pending, onClose, onSubmit,
}: {
  item: DispenseItemLike;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: { dispenseItemId: string; substitutedFromDrugId: string; reason: string }) => void;
}) {
  const [search, setSearch] = useState("");
  const drugs = useQuery({ queryKey: ["pharmacy", "drugs", search], queryFn: () => listDrugs({ limit: 50, search: search || undefined }) });
  const [drugId, setDrugId] = useState("");
  const [reason, setReason] = useState("");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Substitute medication</DialogTitle>
          <DialogDescription>Replace {item.drug?.name ?? "dispensed item"} with an equivalent drug (pharmacist authorization required).</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div>
            <Label className="text-xs">Substitute drug</Label>
            <Input
              className="mt-1"
              placeholder="Search drug master…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setDrugId(""); }}
            />
            <Select value={drugId} onValueChange={setDrugId}>
              <SelectTrigger className="mt-2"><SelectValue placeholder={drugs.isLoading ? "Loading…" : "Select drug"} /></SelectTrigger>
              <SelectContent>
                {(drugs.data?.items ?? []).map((d: DrugCatalogEntry) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}{d.genericName ? ` (${d.genericName})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Reason</Label>
            <Input className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Out of stock, generic equivalent" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={pending || !drugId || !reason.trim()}
            onClick={() => onSubmit({ dispenseItemId: item.id, substitutedFromDrugId: drugId, reason: reason.trim() })}
          >
            {pending ? "Recording…" : "Record substitution"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Return dialog ----------

function ReturnDialog({
  item, pending, onClose, onSubmit,
}: {
  item: DispenseItemLike;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: { dispenseItemId: string; quantityReturned: number; reason: string }) => void;
}) {
  const returned = (item.returns ?? []).reduce((sum, r) => sum + r.quantityReturned, 0);
  const remaining = item.quantityDispensed - returned;
  const [qty, setQty] = useState(Math.max(1, remaining));
  const [reason, setReason] = useState("");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Process return</DialogTitle>
          <DialogDescription>
            {item.drug?.name ?? "Item"} · {item.quantityDispensed} dispensed, {remaining} returnable. Restocks the original batch.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div>
            <Label className="text-xs">Quantity to return</Label>
            <Input
              type="number"
              min={1}
              max={Math.max(1, remaining)}
              className="mt-1"
              value={String(qty)}
              onChange={(e) => setQty(Math.min(Math.max(1, remaining), Number(e.target.value) || 1))}
            />
          </div>
          <div>
            <Label className="text-xs">Reason</Label>
            <Input className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Patient declined, wrong dosage" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={pending || remaining <= 0 || !reason.trim()}
            onClick={() => onSubmit({ dispenseItemId: item.id, quantityReturned: qty, reason: reason.trim() })}
          >
            {pending ? "Processing…" : "Process return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
