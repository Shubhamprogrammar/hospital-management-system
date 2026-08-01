"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { BedDoubleIcon, PlusIcon } from "lucide-react";
import { admitSchema, type AdmitValues } from "@/modules/ipd/constant/schemas";

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
import { admitPatient, dischargePatient, listAdmissions, listBeds, listWards } from "@/shared/services/ipd.service";
import { searchPatients } from "@/shared/services/patients.service";
import { listDoctors } from "@/shared/services/org.service";
import type { IpdAdmission } from "@/shared/types/domain";

export default function IpdPage() {
  const queryClient = useQueryClient();
  const [admitOpen, setAdmitOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");

  const list = useListQuery<IpdAdmission>({
    queryKey: ["ipd", statusFilter],
    queryFn: (params) => listAdmissions({ ...params, status: statusFilter || undefined }),
  });

  const patients = useQuery({ queryKey: ["patients", "options"], queryFn: () => searchPatients({ limit: 50 }) });
  const doctors = useQuery({ queryKey: ["doctors", "options"], queryFn: () => listDoctors({ limit: 50 }) });
  const wards = useQuery({ queryKey: ["wards", "options"], queryFn: () => listWards({ limit: 50 }) });
  const beds = useQuery({ queryKey: ["beds", "available"], queryFn: () => listBeds({ limit: 50, status: "AVAILABLE" }) });

  const form = useForm<AdmitValues>({
    resolver: zodResolver(admitSchema),
    defaultValues: { patientId: "", admittingDoctorId: "", wardId: "", bedId: "", admissionType: "REFERRAL" },
  });

  const admit = useMutation({
    mutationFn: (v: AdmitValues) => admitPatient(v),
    onSuccess: () => {
      toast.success("Patient admitted");
      setAdmitOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["ipd"] });
      queryClient.invalidateQueries({ queryKey: ["beds"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const discharge = useMutation({
    mutationFn: (id: string) => dischargePatient(id, {}),
    onSuccess: () => {
      toast.success("Patient discharged");
      queryClient.invalidateQueries({ queryKey: ["ipd"] });
      queryClient.invalidateQueries({ queryKey: ["beds"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="IPD Admissions"
        description="In-patient admissions, ward assignments, and discharges."
        actions={<Button onClick={() => setAdmitOpen(true)}><PlusIcon /> Admit patient</Button>}
      />

      <div className="mb-4">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === "ALL" ? "" : v)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {["ADMITTED", "IN_TREATMENT", "DISCHARGE_PLANNED", "DISCHARGED"].map((s) => (
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
          <EmptyState icon={BedDoubleIcon} title="No admissions" description="Admit a patient to get started." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Admission No.</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead>Ward / Bed</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.items.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs">{a.admissionNo}</TableCell>
                  <TableCell>
                    <p className="font-medium">{a.patient?.name ?? "—"}</p>
                    <p className="font-mono text-xs text-muted-foreground">{a.patient?.uhid}</p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{a.admittingDoctor?.name ?? "—"}</TableCell>
                  <TableCell>{a.ward?.name ?? "—"} / {a.bed?.bedNumber ?? "—"}</TableCell>
                  <TableCell>{a.admissionType.replace(/_/g, " ")}</TableCell>
                  <TableCell><StatusBadge status={a.status} /></TableCell>
                  <TableCell className="text-right">
                    {a.status !== "DISCHARGED" && (
                      <Button size="sm" variant="outline" onClick={() => discharge.mutate(a.id)}>Discharge</Button>
                    )}
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

      <Dialog open={admitOpen} onOpenChange={setAdmitOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Admit patient</DialogTitle>
            <DialogDescription>Assign a patient to a ward bed.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => admit.mutate(v))} className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="patientId" render={({ field }) => (
                <FormItem className="col-span-2">
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
              <FormField control={form.control} name="admittingDoctorId" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Admitting doctor</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {doctors.data?.items.map((d) => <SelectItem key={d.id} value={d.id}>{d.user?.name} — {d.specialization}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="wardId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Ward</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select ward" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {wards.data?.items.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="bedId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Bed</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select bed" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {beds.data?.items.map((b) => <SelectItem key={b.id} value={b.id}>{b.ward?.name} — {b.bedNumber}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="admissionType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Admission type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="EMERGENCY">Emergency</SelectItem>
                      <SelectItem value="REFERRAL">Referral</SelectItem>
                      <SelectItem value="DIRECT">Direct</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter className="col-span-2">
                <Button type="submit" disabled={admit.isPending}>{admit.isPending ? "Admitting…" : "Admit patient"}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
