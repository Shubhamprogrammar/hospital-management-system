"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { FlaskConicalIcon, PlusIcon, SettingsIcon } from "lucide-react";
import { orderSchema, type OrderValues } from "@/modules/laboratory/constant/schemas";

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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/shared/components/ui/form";
import { PaginationBar } from "@/shared/components/ui/pagination";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import { StatusBadge } from "@/shared/components/feedback/StatusBadge";
import { useListQuery } from "@/shared/lib/hooks/useListQuery";
import {
  collectSample, createLabOrder, createLabTest, enterResults, listLabOrders, listLabTests, releaseReport, verifyLabResults,
  type CreateLabTestInput,
} from "@/shared/services/clinical.service";
import { searchPatients } from "@/shared/services/patients.service";
import { listDoctors } from "@/shared/services/org.service";
import { useSession } from "@/shared/lib/auth-client";
import { ROLES, hasRole, type Role } from "@/shared/types";
import type { LabOrder, LabOrderStatus, LabTest, LabTestParameter } from "@/shared/types/domain";

export default function LaboratoryPage() {
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;
  // Mirrors server authorize() lists: POST /lab/orders is SUPER_ADMIN/DOCTOR
  // only, POST /lab/tests is SUPER_ADMIN/HOSPITAL_ADMIN/PATHOLOGIST only.
  const canCreateOrder = hasRole(role, ROLES.DOCTOR);
  const canManageTests = hasRole(role, ROLES.PATHOLOGIST);

  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [manageTestsOpen, setManageTestsOpen] = useState(false);
  const [resultsFor, setResultsFor] = useState<LabOrder | null>(null);
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
  const results = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Record<string, string> }) =>
      enterResults(id, {
        results: Object.entries(values)
          .filter(([, value]) => value.trim() !== "")
          .map(([testParameterId, value]) => ({ testParameterId, value: value.trim() })),
      }),
    onSuccess: () => {
      toast.success("Results entered");
      setResultsFor(null);
      queryClient.invalidateQueries({ queryKey: ["lab"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Laboratory"
        description="Lab orders, sample collection, verification, and report release."
        actions={
          <>
            {canManageTests && (
              <Button variant="outline" onClick={() => setManageTestsOpen(true)}><SettingsIcon /> Manage tests</Button>
            )}
            {canCreateOrder && (
              <Button onClick={() => setCreateOpen(true)}><PlusIcon /> Create order</Button>
            )}
          </>
        }
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
                      {o.status === "SAMPLE_COLLECTED" && <Button size="sm" variant="outline" onClick={() => setResultsFor(o)}>Enter results</Button>}
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

      <ManageTestsDialog
        open={manageTestsOpen}
        onOpenChange={setManageTestsOpen}
        testList={tests.data?.items ?? []}
      />

      {/* Enter results dialog */}
      <EnterResultsDialog
        order={resultsFor}
        pending={results.isPending}
        onClose={() => setResultsFor(null)}
        onSubmit={(values) => resultsFor && results.mutate({ id: resultsFor.id, values })}
      />
    </div>
  );
}

/** Collects every test parameter across all ordered tests. */
function parametersOf(order: LabOrder | null): Array<LabTestParameter & { testName: string }> {
  if (!order) return [];
  const out: Array<LabTestParameter & { testName: string }> = [];
  for (const ot of order.orderTests ?? []) {
    for (const p of ot.test.parameters ?? []) {
      out.push({ ...p, testName: ot.test.name });
    }
  }
  return out;
}

type ParamLine = {
  name: string;
  unit: string;
  referenceRangeMin: string;
  referenceRangeMax: string;
  criticalLow: string;
  criticalHigh: string;
};

const emptyParamLine: ParamLine = {
  name: "", unit: "", referenceRangeMin: "", referenceRangeMax: "", criticalLow: "", criticalHigh: "",
};

function ManageTestsDialog({
  open, onOpenChange, testList,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  testList: LabTest[];
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [sampleType, setSampleType] = useState("");
  const [params, setParams] = useState<ParamLine[]>([emptyParamLine]);

  const reset = () => {
    setName(""); setCode(""); setCategory(""); setPrice(""); setSampleType("");
    setParams([emptyParamLine]);
  };

  const create = useMutation({
    mutationFn: (input: CreateLabTestInput) => createLabTest(input),
    onSuccess: () => {
      toast.success("Test added to catalog");
      reset();
      queryClient.invalidateQueries({ queryKey: ["lab", "tests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ready = name.trim() !== "" && code.trim() !== "";

  const submit = () => {
    const parameters = params
      .filter((p) => p.name.trim() !== "")
      .map((p) => ({
        name: p.name.trim(),
        unit: p.unit.trim() || undefined,
        referenceRangeMin: p.referenceRangeMin ? Number(p.referenceRangeMin) : undefined,
        referenceRangeMax: p.referenceRangeMax ? Number(p.referenceRangeMax) : undefined,
        criticalLow: p.criticalLow ? Number(p.criticalLow) : undefined,
        criticalHigh: p.criticalHigh ? Number(p.criticalHigh) : undefined,
      }));
    create.mutate({
      name: name.trim(),
      code: code.trim(),
      category: category.trim() || undefined,
      price: price ? Number(price) : undefined,
      sampleType: sampleType.trim() || undefined,
      parameters: parameters.length ? parameters : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage lab tests</DialogTitle>
          <DialogDescription>The test catalog used when creating lab orders.</DialogDescription>
        </DialogHeader>

        <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
          {testList.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">No tests in the catalog yet.</p>
          ) : (
            testList.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded px-2 py-1.5 text-sm">
                <div>
                  <span className="font-medium">{t.name}</span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{t.code}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {t.category ?? "—"} · {t.parameters?.length ?? 0} param{t.parameters?.length === 1 ? "" : "s"}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-col gap-4 border-t border-border pt-4">
          <p className="text-sm font-medium">Add test</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label className="text-xs">Name</Label>
              <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Thyroid Profile" />
            </div>
            <div>
              <Label className="text-xs">Code</Label>
              <Input className="mt-1" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="TFT" />
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <Input className="mt-1" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Biochemistry" />
            </div>
            <div>
              <Label className="text-xs">Price (₹)</Label>
              <Input className="mt-1" type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Sample type</Label>
              <Input className="mt-1" value={sampleType} onChange={(e) => setSampleType(e.target.value)} placeholder="Blood" />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Parameters</p>
            {params.map((p, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_70px_70px_70px] items-center gap-1.5">
                <Input
                  className="h-8 text-xs"
                  placeholder="Parameter name"
                  value={p.name}
                  onChange={(e) => setParams((prev) => prev.map((l, i) => (i === idx ? { ...l, name: e.target.value } : l)))}
                />
                <Input
                  className="h-8 text-xs"
                  placeholder="Unit"
                  value={p.unit}
                  onChange={(e) => setParams((prev) => prev.map((l, i) => (i === idx ? { ...l, unit: e.target.value } : l)))}
                />
                <Input
                  className="h-8 text-xs"
                  type="number"
                  placeholder="Ref min"
                  value={p.referenceRangeMin}
                  onChange={(e) => setParams((prev) => prev.map((l, i) => (i === idx ? { ...l, referenceRangeMin: e.target.value } : l)))}
                />
                <Input
                  className="h-8 text-xs"
                  type="number"
                  placeholder="Ref max"
                  value={p.referenceRangeMax}
                  onChange={(e) => setParams((prev) => prev.map((l, i) => (i === idx ? { ...l, referenceRangeMax: e.target.value } : l)))}
                />
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" onClick={() => setParams((prev) => [...prev, emptyParamLine])}>
              + Add parameter
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button disabled={!ready || create.isPending} onClick={submit}>
            {create.isPending ? "Adding…" : "Add test"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EnterResultsDialog({
  order, pending, onClose, onSubmit,
}: {
  order: LabOrder | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  const key = order?.id ?? null;
  if (key !== syncedKey) {
    setSyncedKey(key);
    setValues({});
  }

  const parameters = parametersOf(order);
  const filled = Object.values(values).filter((v) => v.trim() !== "").length;

  return (
    <Dialog open={!!order} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enter results</DialogTitle>
          <DialogDescription>
            {order?.barcode} · {order?.patient?.name}
          </DialogDescription>
        </DialogHeader>
        {parameters.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No test parameters configured for this order.</p>
        ) : (
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {parameters.map((p) => (
              <div key={p.id} className="grid grid-cols-[1fr_90px] items-center gap-2 rounded-md border border-border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.testName}{p.referenceRangeMin != null || p.referenceRangeMax != null ? ` · ref ${p.referenceRangeMin ?? ""}–${p.referenceRangeMax ?? ""}` : ""}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Input
                    className="h-8 text-sm"
                    value={values[p.id] ?? ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    placeholder={p.unit ?? "value"}
                  />
                  {p.unit && <span className="text-xs text-muted-foreground">{p.unit}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={pending || filled === 0} onClick={() => onSubmit(values)}>
            {pending ? "Saving…" : `Enter results (${filled})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
