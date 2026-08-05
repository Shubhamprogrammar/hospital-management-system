"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { PlusIcon, WalletIcon } from "lucide-react";
import { PAYMENT_MODES, paymentSchema, type PaymentValues } from "@/modules/payments/constant/schemas";

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
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import { StatusBadge } from "@/shared/components/feedback/StatusBadge";
import { listBills, recordPayment } from "@/shared/services/billing.service";
import type { Bill } from "@/shared/types/domain";

export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);

  const bills = useQuery({ queryKey: ["bills", "payable"], queryFn: () => listBills({ limit: 50, status: "FINALIZED" }) });

  const form = useForm<PaymentValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { billId: "", amount: "0", mode: "CASH" },
  });

  const pay = useMutation({
    mutationFn: (v: PaymentValues) => recordPayment({ billId: v.billId, amount: Number(v.amount), mode: v.mode }),
    onSuccess: () => {
      toast.success("Payment recorded");
      setPayOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["bills"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Record payments against finalized bills."
        actions={<Button onClick={() => setPayOpen(true)}><PlusIcon /> Record payment</Button>}
      />

      {/* Bills to pay */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Finalized bills</h2>
        </div>
        {bills.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
        ) : bills.isError ? (
          <ErrorState error={bills.error} />
        ) : bills.data?.items.length === 0 ? (
          <EmptyState icon={WalletIcon} title="No payable bills" description="Finalize bills to record payments." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bills.data?.items.map((b: Bill) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-xs">{b.invoiceNo ?? b.id.slice(0, 8)}</TableCell>
                  <TableCell className="font-medium">{b.patient?.name ?? "—"}</TableCell>
                  <TableCell><StatusBadge status={b.status} /></TableCell>
                  <TableCell className="text-right font-semibold">₹{Number(b.totalAmount)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { form.setValue("billId", b.id); form.setValue("amount", String(Number(b.totalAmount))); setPayOpen(true); }}
                    >
                      Record payment
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>Capture a payment against a bill.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => pay.mutate(v))} className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="amount" render={({ field }) => (
                <FormItem><FormLabel>Amount (₹)</FormLabel><FormControl><Input type="number" min={1} {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="mode" render={({ field }) => (
                <FormItem>
                  <FormLabel>Mode</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {PAYMENT_MODES.map((m) => (
                        <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter className="col-span-2">
                <Button type="submit" disabled={pay.isPending}>{pay.isPending ? "Recording…" : "Record payment"}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
