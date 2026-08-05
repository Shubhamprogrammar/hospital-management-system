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
import { PaginationBar } from "@/shared/components/ui/pagination";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import { useListQuery } from "@/shared/lib/hooks/useListQuery";
import { createWard, deactivateWard, listWards } from "@/shared/services/ipd.service";
import type { Ward } from "@/shared/types/domain";

export default function WardsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

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
                    {w.isActive && (
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deactivate.mutate(w.id)}>Deactivate</Button>
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
