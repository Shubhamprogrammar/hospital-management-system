"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { BedDoubleIcon, PlusIcon } from "lucide-react";
import { BED_STATUSES, bedSchema, type BedValues } from "@/modules/beds/constant/schemas";

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
import { changeBedStatus, createBed, getBed, listBeds, listWards, removeBed } from "@/shared/services/ipd.service";
import type { Bed } from "@/shared/types/domain";

export default function BedsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [detailFor, setDetailFor] = useState<Bed | null>(null);
  const [deleteFor, setDeleteFor] = useState<Bed | null>(null);

  const bedDetail = useQuery({
    queryKey: ["beds", "detail", detailFor?.id],
    queryFn: () => getBed(detailFor!.id),
    enabled: !!detailFor,
  });

  const list = useListQuery<Bed>({
    queryKey: ["beds", statusFilter],
    queryFn: (params) => listBeds({ ...params, status: statusFilter || undefined }),
  });

  const wards = useQuery({ queryKey: ["wards", "options"], queryFn: () => listWards({ limit: 50 }) });

  const form = useForm<BedValues>({
    resolver: zodResolver(bedSchema),
    defaultValues: { wardId: "", bedNumber: "", bedType: "GENERAL" },
  });

  const create = useMutation({
    mutationFn: (v: BedValues) => createBed(v),
    onSuccess: () => {
      toast.success("Bed created");
      setCreateOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["beds"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Bed["status"] }) => changeBedStatus(id, { status }),
    onSuccess: () => {
      toast.success("Bed status updated");
      queryClient.invalidateQueries({ queryKey: ["beds"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeBed(id),
    onSuccess: () => {
      toast.success("Bed removed");
      setDeleteFor(null);
      queryClient.invalidateQueries({ queryKey: ["beds"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Beds"
        description="Bed inventory and real-time status."
        actions={<Button onClick={() => setCreateOpen(true)}><PlusIcon /> Add bed</Button>}
      />

      <div className="mb-4">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === "ALL" ? "" : v)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {BED_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
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
          <EmptyState icon={BedDoubleIcon} title="No beds" description="Add beds to wards to get started." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bed</TableHead>
                <TableHead>Ward</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.items.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.bedNumber}</TableCell>
                  <TableCell className="text-muted-foreground">{b.ward?.name ?? "—"} ({b.ward?.floor ?? "—"})</TableCell>
                  <TableCell>{b.bedType.replace(/_/g, " ")}</TableCell>
                  <TableCell><StatusBadge status={b.status} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => setDetailFor(b)}>Details</Button>
                      <Select
                        value={b.status}
                        onValueChange={(v) => setStatus.mutate({ id: b.id, status: v as Bed["status"] })}
                      >
                        <SelectTrigger className="ml-auto h-8 w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {BED_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteFor(b)}>Remove</Button>
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

      {/* Bed detail dialog */}
      <Dialog open={!!detailFor} onOpenChange={(o) => !o && setDetailFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bed details</DialogTitle>
            <DialogDescription>{detailFor?.bedNumber}</DialogDescription>
          </DialogHeader>
          {bedDetail.isLoading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : bedDetail.isError ? (
            <ErrorState error={bedDetail.error} onRetry={() => bedDetail.refetch()} />
          ) : bedDetail.data ? (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-muted-foreground">Ward</p><p className="font-medium">{bedDetail.data.ward?.name ?? "—"} ({bedDetail.data.ward?.floor ?? "—"})</p></div>
              <div><p className="text-muted-foreground">Type</p><p className="font-medium">{bedDetail.data.bedType.replace(/_/g, " ")}</p></div>
              <div><p className="text-muted-foreground">Status</p><StatusBadge status={bedDetail.data.status} /></div>
              <div><p className="text-muted-foreground">Current admission</p><p className="font-medium">{bedDetail.data.currentAdmissionId ? bedDetail.data.currentAdmissionId.slice(0, 8) : "None"}</p></div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteFor} onOpenChange={(o) => !o && setDeleteFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove bed</DialogTitle>
            <DialogDescription>Remove bed {deleteFor?.bedNumber}? This is permanent.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteFor(null)}>Cancel</Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => deleteFor && remove.mutate(deleteFor.id)}>
              {remove.isPending ? "Removing…" : "Remove bed"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add bed</DialogTitle>
            <DialogDescription>Create a bed within a ward.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="wardId" render={({ field }) => (
                <FormItem className="col-span-2">
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
              <FormField control={form.control} name="bedNumber" render={({ field }) => (
                <FormItem><FormLabel>Bed number</FormLabel><FormControl><Input placeholder="A-101" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="bedType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {["GENERAL", "ICU", "ISOLATION"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter className="col-span-2">
                <Button type="submit" disabled={create.isPending}>{create.isPending ? "Adding…" : "Add bed"}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
