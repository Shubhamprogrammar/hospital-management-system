"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { FlaskConicalIcon, PlusIcon } from "lucide-react";
import { orderSchema, type OrderValues } from "@/modules/laboratory/constant/schemas";

import { PageHeader } from "@/shared/components/layout/PageHeader";
import { Button } from "@/shared/components/ui/button";
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
  collectSample, createLabOrder, listLabOrders, listLabTests, releaseReport, verifyLabResults,
} from "@/shared/services/clinical.service";
import { searchPatients } from "@/shared/services/patients.service";
import { listDoctors } from "@/shared/services/org.service";
import type { LabOrder, LabOrderStatus } from "@/shared/types/domain";

export default function LaboratoryPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<LabOrderStatus | "">("");

  const list = useListQuery<LabOrder>({
    queryKey: ["lab", "orders", statusFilter],
    queryFn: (params) => listLabOrders({ ...params, status: statusFilter || undefined }),
  });
  const tests = useQuery({ queryKey: ["lab", "tests"], queryFn: () => listLabTests({ limit: 100 }) });
  const patients = useQuery({ queryKey: ["patients", "options"], queryFn: () => searchPatients({ limit: 50 }) });
  const doctors = useQuery({ queryKey: ["doctors", "options"], queryFn: () => listDoctors({ limit: 50 }) });

  const form = useForm<OrderValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: { patientId: "", doctorId: "", testIds: [] },
  });
  const watchedTestIds = useWatch({ control: form.control, name: "testIds" });

  const create = useMutation({
    mutationFn: (v: OrderValues) => createLabOrder(v),
    onSuccess: () => {
      toast.success("Lab order created");
      setCreateOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["lab"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const action = (fn: (id: string) => Promise<unknown>, message: string) => ({
    mutationFn: fn,
    onSuccess: () => { toast.success(message); queryClient.invalidateQueries({ queryKey: ["lab"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const collect = useMutation(action((id) => collectSample(id), "Sample collected"));
  const verify = useMutation(action((id) => verifyLabResults(id), "Results verified"));
  const release = useMutation(action((id) => releaseReport(id), "Report released"));

  return (
    <div>
      <PageHeader
        title="Laboratory"
        description="Lab orders, sample collection, verification, and report release."
        actions={<Button onClick={() => setCreateOpen(true)}><PlusIcon /> Create order</Button>}
      />

      <div className="mb-4">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === "ALL" ? "" : (v as LabOrderStatus))}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {["ORDERED", "SAMPLE_COLLECTED", "RESULTS_ENTERED", "VERIFIED", "REPORT_RELEASED", "CANCELLED"].map((s) => (
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
          <EmptyState icon={FlaskConicalIcon} title="No lab orders" description="Create a lab order to get started." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Barcode</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Tests</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.items.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">{o.barcode}</TableCell>
                  <TableCell className="font-medium">{o.patient?.name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{o.orderTests?.map((t) => t.test.name).join(", ") || "—"}</TableCell>
                  <TableCell><StatusBadge status={o.status} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {o.status === "ORDERED" && <Button size="sm" variant="outline" onClick={() => collect.mutate(o.id)}>Collect</Button>}
                      {o.status === "RESULTS_ENTERED" && <Button size="sm" variant="outline" onClick={() => verify.mutate(o.id)}>Verify</Button>}
                      {o.status === "VERIFIED" && <Button size="sm" onClick={() => release.mutate(o.id)}>Release</Button>}
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
            <DialogTitle>Create lab order</DialogTitle>
            <DialogDescription>Order lab tests for a patient.</DialogDescription>
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
              <FormField control={form.control} name="testIds" render={() => (
                <FormItem>
                  <FormLabel>Tests</FormLabel>
                  <div className="grid max-h-52 grid-cols-2 gap-1.5 overflow-y-auto rounded-md border border-border p-2">
                    {tests.data?.items.map((t) => (
                      <label key={t.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={watchedTestIds.includes(t.id)}
                          onChange={(e) => {
                            const current = form.getValues("testIds");
                            form.setValue("testIds", e.target.checked ? [...current, t.id] : current.filter((id) => id !== t.id));
                          }}
                        />
                        <span className="truncate">{t.name}</span>
                      </label>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="submit" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create order"}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
