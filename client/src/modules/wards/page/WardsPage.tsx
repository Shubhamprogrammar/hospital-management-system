"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { Building2Icon, PlusIcon } from "lucide-react";
import { WARD_TYPES, wardSchema, type WardValues } from "@/modules/wards/constant/schemas";

import { PageHeader } from "@/shared/components/layout/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
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
import { Label } from "@/shared/components/ui/label";
import { PaginationBar } from "@/shared/components/ui/pagination";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import { useListQuery } from "@/shared/lib/hooks/useListQuery";
import { createWard, deactivateWard, getWard, getWardCensus, listWards, updateWard } from "@/shared/services/ipd.service";
import { useQuery } from "@tanstack/react-query";
import { BarChart3Icon } from "lucide-react";
import type { Ward, WardCensus } from "@/shared/types/domain";

export default function WardsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editFor, setEditFor] = useState<Ward | null>(null);
  const [censusFor, setCensusFor] = useState<Ward | null>(null);
  const [detailFor, setDetailFor] = useState<Ward | null>(null);

  const census = useQuery({
    queryKey: ["wards", "census", censusFor?.id],
    queryFn: () => getWardCensus(censusFor!.id),
    enabled: !!censusFor,
  });

  const wardDetail = useQuery({
    queryKey: ["wards", "detail", detailFor?.id],
    queryFn: () => getWard(detailFor!.id),
    enabled: !!detailFor,
  });

  const list = useListQuery<Ward>({ queryKey: ["wards"], queryFn: (params) => listWards(params) });

  const form = useForm<WardValues>({
    resolver: zodResolver(wardSchema),
    defaultValues: { name: "", wardType: "GENERAL", floor: "", nursePatientRatio: "" },
  });

  const create = useMutation({
    mutationFn: (v: WardValues) => createWard(v),
    onSuccess: () => {
      toast.success("Ward created");
      setCreateOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["wards"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => deactivateWard(id),
    onSuccess: () => {
      toast.success("Ward deactivated");
      queryClient.invalidateQueries({ queryKey: ["wards"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateWard>[1] }) => updateWard(id, input),
    onSuccess: () => {
      toast.success("Ward updated");
      setEditFor(null);
      queryClient.invalidateQueries({ queryKey: ["wards"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Wards"
        description="Ward configuration and bed capacity."
        actions={<Button onClick={() => setCreateOpen(true)}><PlusIcon /> Create ward</Button>}
      />

      <div className="rounded-lg border border-border bg-card">
        {list.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
          </div>
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data?.items.length === 0 ? (
          <EmptyState icon={Building2Icon} title="No wards" description="Create your first ward." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Floor</TableHead>
                <TableHead>Beds</TableHead>
                <TableHead>Ratio</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.items.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-medium">{w.name}</TableCell>
                  <TableCell><Badge variant="secondary">{w.wardType.replace(/_/g, " ")}</Badge></TableCell>
                  <TableCell>{w.floor}</TableCell>
                  <TableCell>{w._count?.beds ?? w.beds?.length ?? 0}</TableCell>
                  <TableCell className="text-muted-foreground">{w.nursePatientRatio ?? "—"}</TableCell>
                  <TableCell><Badge variant={w.isActive ? "success" : "destructive"}>{w.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => setDetailFor(w)}>Details</Button>
                      <Button size="sm" variant="outline" onClick={() => setCensusFor(w)}><BarChart3Icon /> Census</Button>
                      {w.isActive && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setEditFor(w)}>Edit</Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deactivate.mutate(w.id)}>Deactivate</Button>
                        </>
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

      {/* Ward detail dialog */}
      <Dialog open={!!detailFor} onOpenChange={(o) => !o && setDetailFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ward details</DialogTitle>
            <DialogDescription>{detailFor?.name}</DialogDescription>
          </DialogHeader>
          {wardDetail.isLoading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : wardDetail.isError ? (
            <ErrorState error={wardDetail.error} onRetry={() => wardDetail.refetch()} />
          ) : wardDetail.data ? (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-muted-foreground">Type</p><p className="font-medium">{wardDetail.data.wardType.replace(/_/g, " ")}</p></div>
              <div><p className="text-muted-foreground">Floor</p><p className="font-medium">{wardDetail.data.floor}</p></div>
              <div><p className="text-muted-foreground">Status</p><Badge variant={wardDetail.data.isActive ? "success" : "destructive"}>{wardDetail.data.isActive ? "Active" : "Inactive"}</Badge></div>
              <div className="col-span-2">
                <p className="mb-2 text-muted-foreground">Beds ({wardDetail.data.beds?.length ?? 0})</p>
                <div className="flex flex-wrap gap-1.5">
                  {wardDetail.data.beds?.map((b) => (
                    <span key={b.id} className="rounded border border-border px-2 py-1 text-xs">{b.bedNumber}</span>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Census dialog */}
      <Dialog open={!!censusFor} onOpenChange={(o) => !o && setCensusFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ward census</DialogTitle>
            <DialogDescription>{censusFor?.name} · live occupancy</DialogDescription>
          </DialogHeader>
          {census.isLoading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : census.isError ? (
            <ErrorState error={census.error} onRetry={() => census.refetch()} />
          ) : census.data ? (
            <WardCensusView census={census.data} />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editFor} onOpenChange={(o) => !o && setEditFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit ward</DialogTitle>
            <DialogDescription>{editFor?.name}</DialogDescription>
          </DialogHeader>
          <EditWardForm
            ward={editFor}
            pending={update.isPending}
            onClose={() => setEditFor(null)}
            onSubmit={(input) => editFor && update.mutate({ id: editFor.id, input })}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create ward</DialogTitle>
            <DialogDescription>Add a new ward to the hospital.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem className="col-span-2"><FormLabel>Name</FormLabel><FormControl><Input placeholder="Ward 2A" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="wardType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {WARD_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="floor" render={({ field }) => (
                <FormItem><FormLabel>Floor</FormLabel><FormControl><Input placeholder="2nd" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="nursePatientRatio" render={({ field }) => (
                <FormItem className="col-span-2"><FormLabel>Nurse:patient ratio</FormLabel><FormControl><Input placeholder="1:4" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <DialogFooter className="col-span-2">
                <Button type="submit" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create ward"}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WardCensusView({ census }: { census: WardCensus }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md border border-border p-4 text-center">
          <p className="text-2xl font-semibold">{census.totalBeds}</p>
          <p className="text-xs text-muted-foreground">Total beds</p>
        </div>
        <div className="rounded-md border border-border p-4 text-center">
          <p className="text-2xl font-semibold text-amber-600 dark:text-amber-400">{census.occupiedBeds}</p>
          <p className="text-xs text-muted-foreground">Occupied</p>
        </div>
        <div className="rounded-md border border-border p-4 text-center">
          <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{census.availableBeds}</p>
          <p className="text-xs text-muted-foreground">Available</p>
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Current admissions</p>
        {census.admissions.length === 0 ? (
          <EmptyState icon={Building2Icon} title="No current admissions" />
        ) : (
          <div className="space-y-2">
            {census.admissions.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span className="font-medium">{a.patient?.name ?? "Patient"}</span>
                <span className="text-xs text-muted-foreground">{a.bed?.bedNumber ?? "—"} · {a.admissionType.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EditWardForm({
  ward, pending, onClose, onSubmit,
}: {
  ward: Ward | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: Parameters<typeof updateWard>[1]) => void;
}) {
  const [v, setV] = useState({ name: "", wardType: "GENERAL", floor: "", nursePatientRatio: "" });
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  const key = ward?.id ?? null;
  if (key !== syncedKey) {
    setSyncedKey(key);
    setV({
      name: ward?.name ?? "",
      wardType: ward?.wardType ?? "GENERAL",
      floor: ward?.floor ?? "",
      nursePatientRatio: ward?.nursePatientRatio ?? "",
    });
  }
  const valid = v.name.trim() && v.wardType && v.floor.trim();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Label>Name</Label>
        <Input className="mt-1" value={v.name} onChange={(e) => setV((p) => ({ ...p, name: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Type</Label>
          <Select value={v.wardType} onValueChange={(t) => setV((p) => ({ ...p, wardType: t }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {WARD_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Floor</Label>
          <Input className="mt-1" value={v.floor} onChange={(e) => setV((p) => ({ ...p, floor: e.target.value }))} />
        </div>
      </div>
      <div>
        <Label>Nurse:patient ratio</Label>
        <Input className="mt-1" value={v.nursePatientRatio} onChange={(e) => setV((p) => ({ ...p, nursePatientRatio: e.target.value }))} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          disabled={pending || !valid}
          onClick={() =>
            onSubmit({
              name: v.name.trim(),
              wardType: v.wardType as Ward["wardType"],
              floor: v.floor.trim(),
              nursePatientRatio: v.nursePatientRatio.trim() || undefined,
            })
          }
        >
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </DialogFooter>
    </div>
  );
}
