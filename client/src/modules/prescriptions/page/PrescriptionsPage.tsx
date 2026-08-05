"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { PillIcon, PlusIcon } from "lucide-react";
import { ROUTES, prescriptionSchema, type PrescriptionValues } from "@/modules/prescriptions/constant/schemas";

import { PageHeader } from "@/shared/components/layout/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
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
  checkInteractions, createPrescription, getPrescription, getPrescriptionPdf,
  listPrescriptions, renewPrescription,
} from "@/shared/services/clinical.service";
import { searchPatients } from "@/shared/services/patients.service";
import { listDoctors } from "@/shared/services/org.service";
import type { Prescription } from "@/shared/types/domain";

export default function PrescriptionsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [renewFor, setRenewFor] = useState<Prescription | null>(null);
  const [interactionResult, setInteractionResult] = useState<{ safe: boolean; conflicts: unknown[] } | null>(null);

  const list = useListQuery<Prescription>({ queryKey: ["prescriptions"], queryFn: (params) => listPrescriptions(params) });

  const [detailFor, setDetailFor] = useState<Prescription | null>(null);
  const detail = useQuery({
    queryKey: ["prescriptions", "detail", detailFor?.id],
    queryFn: () => getPrescription(detailFor!.id),
    enabled: !!detailFor,
  });

  const patients = useQuery({ queryKey: ["patients", "options"], queryFn: () => searchPatients({ limit: 50 }) });
  const doctors = useQuery({ queryKey: ["doctors", "options"], queryFn: () => listDoctors({ limit: 50 }) });  const form = useForm<PrescriptionValues>({
    resolver: zodResolver(prescriptionSchema),
    defaultValues: {
      patientId: "", doctorId: "", notes: "",
      items: [{ drugName: "", dosage: "", frequency: "", durationDays: "7", route: "ORAL" }],
    },
  });
  const watchedItems = useWatch({ control: form.control, name: "items" });

  const renew = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => renewPrescription(id, { notes: notes || undefined }),
    onSuccess: () => {
      toast.success("Prescription renewed");
      setRenewFor(null);
      queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const interactions = useMutation({
    mutationFn: (drugIds: string[]) => checkInteractions({ drugIds }),
    onSuccess: (data) => setInteractionResult(data),
    onError: (e: Error) => toast.error(e.message),
  });

  const pdf = useMutation({
    mutationFn: (id: string) => getPrescriptionPdf(id),
    onSuccess: (data) => {
      if (data?.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
      } else {
        toast.error("No PDF URL returned");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const create = useMutation({
    mutationFn: (v: PrescriptionValues) =>
      createPrescription({
        patientId: v.patientId,
        doctorId: v.doctorId,
        notes: v.notes,
        // TODO: wire `drugName` to a real DrugMaster id once the backend exposes a drug catalog endpoint.
        items: v.items.map((i) => ({ drugId: i.drugName, dosage: i.dosage, frequency: i.frequency, durationDays: Number(i.durationDays), route: i.route })),
      }),
    onSuccess: () => {
      toast.success("Prescription created");
      setCreateOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Prescriptions"
        description="Create and track patient prescriptions."
        actions={<Button onClick={() => setCreateOpen(true)}><PlusIcon /> New prescription</Button>}
      />

      <div className="rounded-lg border border-border bg-card">
        {list.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
          </div>
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data?.items.length === 0 ? (
          <EmptyState icon={PillIcon} title="No prescriptions" description="Create your first prescription." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.patient?.name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{p.doctor?.name ?? "—"}</TableCell>
                  <TableCell>{p.items?.length ?? 0} items</TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                  <TableCell className="text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => setDetailFor(p)}>Details</Button>
                      {p.status === "ACTIVE" && (
                        <Button size="sm" variant="outline" onClick={() => setRenewFor(p)}>Renew</Button>
                      )}
                      <Button size="sm" variant="outline" disabled={pdf.isPending} onClick={() => pdf.mutate(p.id)}>PDF</Button>
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>New prescription</DialogTitle>
            <DialogDescription>Create a prescription for a patient.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="patientId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Patient</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {patients.data?.items.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="doctorId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Doctor</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {doctors.data?.items.map((d) => <SelectItem key={d.id} value={d.id}>{d.user?.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>Notes</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="space-y-2">
                <p className="text-sm font-medium">Items</p>
                {watchedItems.map((_, index) => (
                  <div key={index} className="grid grid-cols-2 gap-2 rounded-md border border-border p-2">
                    <FormField control={form.control} name={`items.${index}.drugName`} render={({ field }) => (
                      <FormItem className="col-span-2"><FormControl><Input placeholder="Drug name" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name={`items.${index}.dosage`} render={({ field }) => (
                      <FormItem><FormControl><Input placeholder="Dosage (e.g. 500mg)" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name={`items.${index}.frequency`} render={({ field }) => (
                      <FormItem><FormControl><Input placeholder="Frequency (e.g. 1-0-1)" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name={`items.${index}.durationDays`} render={({ field }) => (
                      <FormItem><FormControl><Input type="number" placeholder="Days" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name={`items.${index}.route`} render={({ field }) => (
                      <FormItem>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            {ROUTES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => form.setValue("items", [...form.getValues("items"), { drugName: "", dosage: "", frequency: "", durationDays: "7", route: "ORAL" }])}
                >
                  + Add item
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={interactions.isPending}
                  onClick={() =>
                    interactions.mutate(form.getValues("items").map((i) => i.drugName.trim()).filter(Boolean))
                  }
                >
                  {interactions.isPending ? "Checking…" : "Check interactions"}
                </Button>
                {interactionResult && (
                  <span className={`text-xs ${interactionResult.safe ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                    {interactionResult.safe
                      ? `✓ No conflicts (${interactionResult.conflicts.length})`
                      : `⚠ ${interactionResult.conflicts.length} potential interaction(s)`}
                  </span>
                )}
              </div>
              <DialogFooter>
                <Button type="submit" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create prescription"}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={!!detailFor} onOpenChange={(o) => !o && setDetailFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Prescription details</DialogTitle>
            <DialogDescription>
              {detailFor?.patient?.name} · {detailFor?.doctor?.name ?? ""}
            </DialogDescription>
          </DialogHeader>
          {detail.isLoading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : detail.isError ? (
            <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
          ) : detail.data ? (
            <div className="flex flex-col gap-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-muted-foreground">Status</p><StatusBadge status={detail.data.status} /></div>
                <div><p className="text-muted-foreground">Created</p><p className="font-medium">{new Date(detail.data.createdAt).toLocaleString()}</p></div>
              </div>
              <div>
                <p className="mb-2 text-muted-foreground">Items ({detail.data.items?.length ?? 0})</p>
                <div className="space-y-2">
                  {detail.data.items?.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                      <div>
                        <p className="font-medium">{item.drug?.name ?? "Drug"}</p>
                        <p className="text-xs text-muted-foreground">{item.dosage} · {item.frequency} · {item.durationDays}d</p>
                      </div>
                      <span className="text-xs text-muted-foreground">{item.route}</span>
                    </div>
                  ))}
                </div>
              </div>
              {detail.data.notes && (
                <div>
                  <p className="mb-1 text-muted-foreground">Notes</p>
                  <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-3">{detail.data.notes}</p>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Renew dialog */}
      <Dialog open={!!renewFor} onOpenChange={(o) => !o && setRenewFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Renew prescription</DialogTitle>
            <DialogDescription>
              {renewFor?.patient?.name} · {renewFor?.items?.length ?? 0} items · creates a new active prescription superseding this one.
            </DialogDescription>
          </DialogHeader>
          <RenewForm
            pending={renew.isPending}
            onSubmit={(notes) => renewFor && renew.mutate({ id: renewFor.id, notes })}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RenewForm({ pending, onSubmit }: { pending: boolean; onSubmit: (notes?: string) => void }) {
  const [notes, setNotes] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(notes.trim() || undefined); }} className="flex flex-col gap-4">
      <div className="grid gap-1.5">
        <FormLabel>Notes (optional)</FormLabel>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Renewal note…" />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending}>{pending ? "Renewing…" : "Renew prescription"}</Button>
      </DialogFooter>
    </form>
  );
}
