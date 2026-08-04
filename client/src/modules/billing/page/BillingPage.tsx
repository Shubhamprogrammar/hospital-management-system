"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { PlusIcon, ReceiptIcon } from "lucide-react";
import { BILL_STATUSES, billSchema, type BillValues } from "@/modules/billing/constant/schemas";

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
  applyDiscount, createBill, finalizeBill, listBills,
} from "@/shared/services/billing.service";
import { searchPatients } from "@/shared/services/patients.service";
import type { Bill, BillStatus } from "@/shared/types/domain";

export default function BillingPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [discountBill, setDiscountBill] = useState<Bill | null>(null);
  const [statusFilter, setStatusFilter] = useState<BillStatus | "">("");

  const list = useListQuery<Bill>({
    queryKey: ["bills", statusFilter],
    queryFn: (params) => listBills({ ...params, status: statusFilter || undefined }),
  });

  const patients = useQuery({ queryKey: ["patients", "options"], queryFn: () => searchPatients({ limit: 50 }) });

  const form = useForm<BillValues>({
    resolver: zodResolver(billSchema),
    defaultValues: { patientId: "", items: [{ description: "", quantity: "1", unitPrice: "0", sourceModule: "MISC" }] },
  });
  const watchedItems = useWatch({ control: form.control, name: "items" });

  const create = useMutation({
    mutationFn: (v: BillValues) =>
      createBill({ patientId: v.patientId, items: v.items.map((i) => ({ ...i, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) })) }),
    onSuccess: () => {
      toast.success("Bill created");
      setCreateOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["bills"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const discount = useMutation({
    mutationFn: ({ id, percentage }: { id: string; percentage: number }) => applyDiscount(id, { percentage }),
    onSuccess: () => {
      toast.success("Discount applied");
      setDiscountBill(null);
      queryClient.invalidateQueries({ queryKey: ["bills"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const finalize = useMutation({
    mutationFn: (id: string) => finalizeBill(id),
    onSuccess: () => {
      toast.success("Bill finalized");
      queryClient.invalidateQueries({ queryKey: ["bills"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const formatMoney = (v: number | string) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(v));

  return (
    <div>
      <PageHeader
        title="Billing"
        description="Create bills, apply discounts and insurance, and finalize invoices."
        actions={<Button onClick={() => setCreateOpen(true)}><PlusIcon /> Create bill</Button>}
      />

      <div className="mb-4 flex items-center gap-2">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === "ALL" ? "" : (v as BillStatus))}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {BILL_STATUSES.map((s) => (
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
          <EmptyState icon={ReceiptIcon} title="No bills" description="Create your first bill to get started." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.items.map((bill) => (
                <TableRow key={bill.id}>
                  <TableCell className="font-mono text-xs">{bill.invoiceNo ?? bill.id.slice(0, 8)}</TableCell>
                  <TableCell>
                    <p className="font-medium">{bill.patient?.name ?? "—"}</p>
                    <p className="font-mono text-xs text-muted-foreground">{bill.patient?.uhid}</p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{new Date(bill.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell><StatusBadge status={bill.status} /></TableCell>
                  <TableCell className="text-right font-semibold">{formatMoney(bill.totalAmount)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {bill.status === "DRAFT" && (
                        <Button size="sm" variant="outline" onClick={() => setDiscountBill(bill)}>Discount</Button>
                      )}
                      {(bill.status === "DRAFT" || bill.status === "PENDING_APPROVAL") && (
                        <Button size="sm" onClick={() => finalize.mutate(bill.id)}>Finalize</Button>
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

      {/* Create bill dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Create bill</DialogTitle>
            <DialogDescription>Add line items for a patient.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="flex flex-col gap-4">
              <FormField control={form.control} name="patientId" render={({ field }) => (
                <FormItem>
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
              <div className="space-y-2">
                <p className="text-sm font-medium">Line items</p>
                {watchedItems.map((_, index) => (
                  <div key={index} className="grid grid-cols-[1fr_70px_100px_120px] items-center gap-2">
                    <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (
                      <FormItem><FormControl><Input placeholder="Description" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (
                      <FormItem><FormControl><Input type="number" min={1} {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name={`items.${index}.unitPrice`} render={({ field }) => (
                      <FormItem><FormControl><Input type="number" min={0} placeholder="Price" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name={`items.${index}.sourceModule`} render={({ field }) => (
                      <FormItem>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            {["CONSULTATION", "LAB", "PHARMACY", "ROOM_CHARGE", "AMBULANCE", "MISC"].map((m) => (
                              <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>
                            ))}
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
                  onClick={() => form.setValue("items", [...form.getValues("items"), { description: "", quantity: "1", unitPrice: "0", sourceModule: "MISC" }])}
                >
                  + Add item
                </Button>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create bill"}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Discount dialog */}
      <Dialog open={!!discountBill} onOpenChange={(o) => !o && setDiscountBill(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply discount</DialogTitle>
            <DialogDescription>
              {discountBill?.patient?.name} · {discountBill ? formatMoney(discountBill.totalAmount) : ""}
            </DialogDescription>
          </DialogHeader>
          <DiscountForm onSubmit={(pct) => discountBill && discount.mutate({ id: discountBill.id, percentage: pct })} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DiscountForm({ onSubmit }: { onSubmit: (percentage: number) => void }) {
  const [value, setValue] = useState("10");
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(Number(value)); }}
      className="flex flex-col gap-4"
    >
      <div className="grid gap-1.5">
        <p className="text-sm font-medium">Discount %</p>
        <Input type="number" min={0} max={100} value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      <DialogFooter>
        <Button type="submit">Apply discount</Button>
      </DialogFooter>
    </form>
  );
}
