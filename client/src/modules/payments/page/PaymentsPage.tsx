"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { PlusIcon, RotateCcwIcon, WalletIcon } from "lucide-react";
import { PAYMENT_MODES, paymentSchema, type PaymentValues } from "@/modules/payments/constant/schemas";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/shared/components/ui/form";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import { StatusBadge } from "@/shared/components/feedback/StatusBadge";
import {
  createReconciliation, getBill, getReconciliation, initiateGatewayPayment,
  listBills, processRefund, recordPayment,
} from "@/shared/services/billing.service";
import { useSession } from "@/shared/lib/auth-client";
import { ROLES, hasRole, type Role } from "@/shared/types";
import type { Bill, Payment, ReconciliationSummary } from "@/shared/types/domain";

export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;
  const isAdmin = hasRole(role, ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN);

  const [payOpen, setPayOpen] = useState(false);
  const [paymentsFor, setPaymentsFor] = useState<Bill | null>(null);
  const [refundFor, setRefundFor] = useState<{ bill: Bill; payment: Payment } | null>(null);
  const [reconOpen, setReconOpen] = useState(false);

  const bills = useQuery({ queryKey: ["bills", "payable"], queryFn: () => listBills({ limit: 50, status: "FINALIZED" }) });
  const reconciliation = useQuery({ queryKey: ["payments", "reconciliation"], queryFn: () => getReconciliation({ limit: 30 }), enabled: isAdmin });

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
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const gateway = useMutation({
    mutationFn: ({ billId, amount }: { billId: string; amount: number }) => initiateGatewayPayment({ billId, amount }),
    onSuccess: (result) => {
      toast.success("Payment link generated");
      if (result?.paymentUrl) {
        window.open(result.paymentUrl, "_blank", "noopener,noreferrer");
      }
      queryClient.invalidateQueries({ queryKey: ["bills"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refund = useMutation({
    mutationFn: ({ id, input }: { id: string; input: { amount: number; reason: string } }) => processRefund(id, input),
    onSuccess: () => {
      toast.success("Refund initiated");
      setRefundFor(null);
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recon = useMutation({
    mutationFn: (input: { date: string; countedAmount: number }) => createReconciliation(input),
    onSuccess: () => {
      toast.success("Reconciliation created");
      setReconOpen(false);
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const detail = useQuery({
    queryKey: ["bills", "detail", paymentsFor?.id],
    queryFn: () => getBill(paymentsFor!.id),
    enabled: !!paymentsFor,
  });

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Record payments, gateway links, refunds, and reconciliation."
        actions={
          <>
            {isAdmin && <Button variant="outline" onClick={() => setReconOpen(true)}>Reconciliation</Button>}
            <Button onClick={() => setPayOpen(true)}><PlusIcon /> Record payment</Button>
          </>
        }
      />

      <Tabs defaultValue="bills">
        <TabsList className="mb-4">
          <TabsTrigger value="bills">Finalized bills</TabsTrigger>
          {isAdmin && <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>}
        </TabsList>

        <TabsContent value="bills">
          <div className="rounded-lg border border-border bg-card">
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
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => setPaymentsFor(b)}>Payments</Button>
                          {isAdmin && (
                            <Button size="sm" variant="outline" disabled={gateway.isPending} onClick={() => gateway.mutate({ billId: b.id, amount: Number(b.totalAmount) })}>
                              Pay via gateway
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { form.setValue("billId", b.id); form.setValue("amount", String(Number(b.totalAmount))); setPayOpen(true); }}
                          >
                            Record payment
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="reconciliation">
            <div className="rounded-lg border border-border bg-card">
              {reconciliation.isLoading ? (
                <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
              ) : reconciliation.isError ? (
                <ErrorState error={reconciliation.error} />
              ) : (reconciliation.data ?? []).length === 0 ? (
                <EmptyState icon={WalletIcon} title="No reconciliation records" description="Create a daily reconciliation to compare counted vs expected cash." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Expected</TableHead>
                      <TableHead className="text-right">Counted</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(reconciliation.data ?? []).map((r: ReconciliationSummary, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{new Date(r.date).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">₹{Number(r.expectedAmount)}</TableCell>
                        <TableCell className="text-right">₹{Number(r.countedAmount)}</TableCell>
                        <TableCell className={`text-right font-semibold ${Number(r.variance) !== 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                          ₹{Number(r.variance)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>

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

      {/* Bill payments / refunds */}
      <Dialog open={!!paymentsFor} onOpenChange={(o) => !o && setPaymentsFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Payments on bill</DialogTitle>
            <DialogDescription>{paymentsFor?.patient?.name} · {paymentsFor?.invoiceNo ?? ""}</DialogDescription>
          </DialogHeader>
          {detail.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (detail.data?.payments ?? []).length === 0 ? (
            <EmptyState icon={WalletIcon} title="No payments recorded" />
          ) : (
            <div className="space-y-2">
              {detail.data?.payments?.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">₹{Number(p.amount)} · {p.mode.replace(/_/g, " ")}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(p.createdAt).toLocaleString()} · {p.status.replace(/_/g, " ")}
                      {p.gatewayTransactionId ? ` · ${p.gatewayTransactionId}` : ""}
                    </p>
                  </div>
                  {isAdmin && p.status === "SUCCESS" && paymentsFor && (
                    <Button size="sm" variant="outline" onClick={() => setRefundFor({ bill: paymentsFor, payment: p })}>
                      <RotateCcwIcon /> Refund
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Refund dialog */}
      {refundFor && (
        <RefundDialog
          payment={refundFor.payment}
          pending={refund.isPending}
          onClose={() => setRefundFor(null)}
          onSubmit={(input) => refund.mutate({ id: refundFor.payment.id, input })}
        />
      )}

      {/* Reconciliation dialog */}
      <Dialog open={reconOpen} onOpenChange={setReconOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create reconciliation</DialogTitle>
            <DialogDescription>Record counted cash for a day to compare with expected.</DialogDescription>
          </DialogHeader>
          <ReconForm pending={recon.isPending} onSubmit={(input) => recon.mutate(input)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RefundDialog({
  payment, pending, onClose, onSubmit,
}: {
  payment: Payment;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: { amount: number; reason: string }) => void;
}) {
  const [amount, setAmount] = useState(String(Number(payment.amount)));
  const [reason, setReason] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Refund payment</DialogTitle>
          <DialogDescription>₹{Number(payment.amount)} · {payment.mode.replace(/_/g, " ")} · {new Date(payment.createdAt).toLocaleDateString()}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div>
            <Label className="text-xs">Refund amount (₹)</Label>
            <Input className="mt-1" type="number" min={1} max={Number(payment.amount)} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Reason</Label>
            <Input className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Overpayment, cancelled service" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={pending || !Number(amount) || !reason.trim()} onClick={() => onSubmit({ amount: Number(amount), reason: reason.trim() })}>
            {pending ? "Processing…" : "Process refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReconForm({ pending, onSubmit }: { pending: boolean; onSubmit: (input: { date: string; countedAmount: number }) => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (date && Number(amount) >= 0) onSubmit({ date, countedAmount: Number(amount) }); }} className="flex flex-col gap-4">
      <div>
        <Label className="text-xs">Date</Label>
        <Input className="mt-1" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Counted amount (₹)</Label>
        <Input className="mt-1" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending || !date || amount === ""}>{pending ? "Creating…" : "Create reconciliation"}</Button>
      </DialogFooter>
    </form>
  );
}
