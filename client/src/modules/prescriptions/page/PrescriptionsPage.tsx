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
import { createPrescription, listPrescriptions } from "@/shared/services/clinical.service";
import { searchPatients } from "@/shared/services/patients.service";
import { listDoctors } from "@/shared/services/org.service";
import type { Prescription } from "@/shared/types/domain";

export default function PrescriptionsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const list = useListQuery<Prescription>({ queryKey: ["prescriptions"], queryFn: (params) => listPrescriptions(params) });

  const patients = useQuery({ queryKey: ["patients", "options"], queryFn: () => searchPatients({ limit: 50 }) });
  const doctors = useQuery({ queryKey: ["doctors", "options"], queryFn: () => listDoctors({ limit: 50 }) });  const form = useForm<PrescriptionValues>({
    resolver: zodResolver(prescriptionSchema),
    defaultValues: {
      patientId: "", doctorId: "", notes: "",
      items: [{ drugName: "", dosage: "", frequency: "", durationDays: "7", route: "ORAL" }],
    },
  });
  const watchedItems = useWatch({ control: form.control, name: "items" });

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
                <FormLabel>Items</FormLabel>
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
              <DialogFooter>
                <Button type="submit" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create prescription"}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
