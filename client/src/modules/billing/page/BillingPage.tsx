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
  applyDiscount, applyInsurance, approveDiscount, createBill, createInsurancePolicy,
  finalizeBill, issueCreditNote, listBills, listInsurancePolicies,
} from "@/shared/services/billing.service";
import { searchPatients } from "@/shared/services/patients.service";
import { useSession } from "@/shared/lib/auth-client";
import { ROLES, hasRole, type Role } from "@/shared/types";
import type { Bill, BillStatus } from "@/shared/types/domain";

export default function BillingPage() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;
  const isAdmin = hasRole(role, ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN);

  const [createOpen, setCreateOpen] = useState(false);
  const [discountBill, setDiscountBill] = useState<Bill | null>(null);
  const [insuranceBill, setInsuranceBill] = useState<Bill | null>(null);
  const [creditBill, setCreditBill] = useState<Bill | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
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

  const approve = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) => approveDiscount(id, { approved }),
    onSuccess: (_data, vars) => {
      toast.success(vars.approved ? "Discount approved" : "Discount rejected");
      queryClient.invalidateQueries({ queryKey: ["bills"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const insurance = useMutation({
    mutationFn: ({ id, input }: { id: string; input: { insurancePolicyId: string; coverageAmount: number } }) => applyInsurance(id, input),
    onSuccess: () => {
      toast.success("Insurance applied");
      setInsuranceBill(null);
      queryClient.invalidateQueries({ queryKey: ["bills"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const creditNote = useMutation({
    mutationFn: ({ id, input }: { id: string; input: { amount: number; reason: string } }) => issueCreditNote(id, input),
    onSuccess: () => {
      toast.success("Credit note issued");
      setCreditBill(null);
      queryClient.invalidateQueries({ queryKey: ["bills"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const policy = useMutation({
    mutationFn: (input: { patientId: string; providerName: string; policyNo: string; coverageLimit: number; validTill: string }) =>
      createInsurancePolicy(input),
    onSuccess: () => {
      toast.success("Insurance policy created");
      setPolicyOpen(false);
      queryClient.invalidateQueries({ queryKey: ["bills"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Billing"
        description="Create bills, apply discounts and insurance, and finalize invoices."
        actions={
          <>
            <Button variant="outline" onClick={() => setPolicyOpen(true)}>Insurance policy</Button>
            <Button onClick={() => setCreateOpen(true)}><PlusIcon /> Create bill</Button>
          </>
        }
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
                      {isAdmin && bill.status === "PENDING_APPROVAL" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => approve.mutate({ id: bill.id, approved: true })}>Approve</Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => approve.mutate({ id: bill.id, approved: false })}>Reject</Button>
                        </>
                      )}
                      {(bill.status === "DRAFT" || bill.status === "PENDING_APPROVAL") && (
                        <Button size="sm" onClick={() => finalize.mutate(bill.id)}>Finalize</Button>
                      )}
                      {bill.status === "DRAFT" && (
                        <Button size="sm" variant="outline" onClick={() => setInsuranceBill(bill)}>Insurance</Button>
                      )}
                      {(bill.status === "FINALIZED" || bill.status === "PAID" || bill.status === "PARTIALLY_PAID") && (
                        <Button size="sm" variant="outline" onClick={() => setCreditBill(bill)}>Credit note</Button>
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

      {/* Insurance dialog */}
      <InsuranceDialog
        bill={insuranceBill}
        pending={insurance.isPending}
        onClose={() => setInsuranceBill(null)}
        onSubmit={(input) => insuranceBill && insurance.mutate({ id: insuranceBill.id, input })}
      />

      {/* Credit note dialog */}
      <Dialog open={!!creditBill} onOpenChange={(o) => !o && setCreditBill(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Issue credit note</DialogTitle>
            <DialogDescription>{creditBill?.patient?.name} · {creditBill ? formatMoney(creditBill.totalAmount) : ""}</DialogDescription>
          </DialogHeader>
          <CreditNoteForm
            pending={creditNote.isPending}
            onSubmit={(input) => creditBill && creditNote.mutate({ id: creditBill.id, input })}
          />
        </DialogContent>
      </Dialog>

      {/* New insurance policy dialog */}
      <PolicyDialog open={policyOpen} onOpenChange={setPolicyOpen} patients={patients.data?.items ?? []} pending={policy.isPending} onSubmit={(input) => policy.mutate(input)} />
    </div>
  );
}

function formatMoney(v: number | string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(v));
}

function InsuranceDialog({
  bill, pending, onClose, onSubmit,
}: {
  bill: Bill | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: { insurancePolicyId: string; coverageAmount: number }) => void;
}) {
  const policies = useQuery({
    queryKey: ["insurance", "policies", bill?.patientId],
    queryFn: () => listInsurancePolicies({ patientId: bill?.patientId }),
    enabled: !!bill,
  });
  const [policyId, setPolicyId] = useState("");
  const [coverage, setCoverage] = useState("");

  return (
    <Dialog open={!!bill} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Apply insurance</DialogTitle>
          <DialogDescription>
            {bill?.patient?.name} · total {bill ? formatMoney(bill.totalAmount) : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-1 text-xs font-medium">Policy</p>
            <Select value={policyId} onValueChange={setPolicyId}>
              <SelectTrigger><SelectValue placeholder={policies.isLoading ? "Loading…" : "Select policy"} /></SelectTrigger>
              <SelectContent>
                {(policies.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.providerName} · {p.policyNo} (limit {formatMoney(p.coverageLimit)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium">Coverage amount (₹)</p>
            <Input type="number" min={1} value={coverage} onChange={(e) => setCoverage(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={pending || !policyId || !Number(coverage)}
            onClick={() => onSubmit({ insurancePolicyId: policyId, coverageAmount: Number(coverage) })}
          >
            {pending ? "Applying…" : "Apply insurance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreditNoteForm({ pending, onSubmit }: { pending: boolean; onSubmit: (input: { amount: number; reason: string }) => void }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (Number(amount) > 0 && reason.trim()) onSubmit({ amount: Number(amount), reason: reason.trim() }); }} className="flex flex-col gap-4">
      <div>
        <p className="mb-1 text-xs font-medium">Amount (₹)</p>
        <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div>
        <p className="mb-1 text-xs font-medium">Reason</p>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Service not rendered, duplicate charge" />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending || !Number(amount) || !reason.trim()}>{pending ? "Issuing…" : "Issue credit note"}</Button>
      </DialogFooter>
    </form>
  );
}

function PolicyDialog({
  open, onOpenChange, patients, pending, onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patients: Array<{ id: string; name: string; uhid: string }>;
  pending: boolean;
  onSubmit: (input: { patientId: string; providerName: string; policyNo: string; coverageLimit: number; validTill: string }) => void;
}) {
  const [v, setV] = useState({ patientId: "", providerName: "", policyNo: "", coverageLimit: "", validTill: "" });
  const set = (k: keyof typeof v) => (value: string) => setV((prev) => ({ ...prev, [k]: value }));
  const valid = v.patientId && v.providerName.trim() && v.policyNo.trim() && Number(v.coverageLimit) > 0 && v.validTill;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New insurance policy</DialogTitle>
          <DialogDescription>Register a patient&apos;s insurance coverage.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-1 text-xs font-medium">Patient</p>
            <Select value={v.patientId} onValueChange={set("patientId")}>
              <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
              <SelectContent>
                {patients.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.uhid})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="mb-1 text-xs font-medium">Provider</p>
              <Input value={v.providerName} onChange={(e) => set("providerName")(e.target.value)} placeholder="Star Health" />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium">Policy no.</p>
              <Input value={v.policyNo} onChange={(e) => set("policyNo")(e.target.value)} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium">Coverage limit (₹)</p>
              <Input type="number" min={1} value={v.coverageLimit} onChange={(e) => set("coverageLimit")(e.target.value)} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium">Valid till</p>
              <Input type="date" value={v.validTill} onChange={(e) => set("validTill")(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={pending || !valid}
            onClick={() =>
              onSubmit({
                patientId: v.patientId,
                providerName: v.providerName.trim(),
                policyNo: v.policyNo.trim(),
                coverageLimit: Number(v.coverageLimit),
                validTill: v.validTill,
              })
            }
          >
            {pending ? "Creating…" : "Create policy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
