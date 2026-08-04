"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { Building2Icon, PlusIcon } from "lucide-react";
import { departmentSchema, type DepartmentValues } from "@/modules/departments/constant/schemas";

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
import { Textarea } from "@/shared/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/shared/components/ui/form";
import { PaginationBar } from "@/shared/components/ui/pagination";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import { useListQuery } from "@/shared/lib/hooks/useListQuery";
import {
  createDepartment, deactivateDepartment, getDepartment, listDepartmentDoctors,
  listDepartments, updateDepartment,
} from "@/shared/services/org.service";
import { useQuery } from "@tanstack/react-query";
import { StethoscopeIcon } from "lucide-react";
import type { Department } from "@/shared/types/domain";

export default function DepartmentsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editFor, setEditFor] = useState<Department | null>(null);
  const [detailFor, setDetailFor] = useState<Department | null>(null);

  const detail = useQuery({
    queryKey: ["departments", "detail", detailFor?.id],
    queryFn: () => getDepartment(detailFor!.id),
    enabled: !!detailFor,
  });

  const deptDoctors = useQuery({
    queryKey: ["departments", "doctors", detailFor?.id],
    queryFn: () => listDepartmentDoctors(detailFor!.id),
    enabled: !!detailFor,
  });

  const list = useListQuery<Department>({ queryKey: ["departments"], queryFn: (params) => listDepartments(params) });

  const form = useForm<DepartmentValues>({
    resolver: zodResolver(departmentSchema),
    defaultValues: { name: "", code: "", description: "" },
  });

  const create = useMutation({
    mutationFn: (v: DepartmentValues) => createDepartment(v),
    onSuccess: () => {
      toast.success("Department created");
      setCreateOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => deactivateDepartment(id),
    onSuccess: () => {
      toast.success("Department deactivated");
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateDepartment>[1] }) => updateDepartment(id, input),
    onSuccess: () => {
      toast.success("Department updated");
      setEditFor(null);
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Departments"
        description="Manage hospital departments."
        actions={<Button onClick={() => setCreateOpen(true)}><PlusIcon /> Create department</Button>}
      />

      <div className="rounded-lg border border-border bg-card">
        {list.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
          </div>
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data?.items.length === 0 ? (
          <EmptyState icon={Building2Icon} title="No departments" description="Create your first department." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Head</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.items.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-xs">{d.code}</TableCell>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell className="max-w-64 truncate text-muted-foreground">{d.description ?? "—"}</TableCell>
                  <TableCell>{d.hod?.name ?? "—"}</TableCell>
                  <TableCell><Badge variant={d.isActive ? "success" : "destructive"}>{d.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => setDetailFor(d)}>Details</Button>
                      {d.isActive && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setEditFor(d)}>Edit</Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deactivate.mutate(d.id)}>Deactivate</Button>
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

      {/* Detail dialog */}
      <Dialog open={!!detailFor} onOpenChange={(o) => !o && setDetailFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Department details</DialogTitle>
            <DialogDescription>{detailFor?.name}</DialogDescription>
          </DialogHeader>
          {detail.isLoading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : detail.isError ? (
            <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
          ) : detail.data ? (
            <div className="flex flex-col gap-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-muted-foreground">Code</p><p className="font-mono text-xs">{detail.data.code}</p></div>
                <div><p className="text-muted-foreground">Head</p><p className="font-medium">{detail.data.hod?.name ?? "—"}</p></div>
                <div><p className="text-muted-foreground">Description</p><p className="font-medium">{detail.data.description ?? "—"}</p></div>
                <div><p className="text-muted-foreground">Status</p><Badge variant={detail.data.isActive ? "success" : "destructive"}>{detail.data.isActive ? "Active" : "Inactive"}</Badge></div>
              </div>
              <div>
                <p className="mb-2 text-muted-foreground">Doctors</p>
                {deptDoctors.isLoading ? (
                  <Skeleton className="h-20 w-full" />
                ) : deptDoctors.data?.length === 0 ? (
                  <EmptyState icon={StethoscopeIcon} title="No doctors in this department" />
                ) : (
                  <div className="space-y-1.5">
                    {deptDoctors.data?.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                        <span className="font-medium">{doc.user?.name ?? "—"}</span>
                        <span className="text-xs text-muted-foreground">{doc.specialization}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editFor} onOpenChange={(o) => !o && setEditFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit department</DialogTitle>
            <DialogDescription>{editFor?.name}</DialogDescription>
          </DialogHeader>
          <EditDepartmentForm
            department={editFor}
            pending={update.isPending}
            onClose={() => setEditFor(null)}
            onSubmit={(input) => editFor && update.mutate({ id: editFor.id, input })}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create department</DialogTitle>
            <DialogDescription>Add a new department to the hospital.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="flex flex-col gap-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="Cardiology" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="code" render={({ field }) => (
                <FormItem><FormLabel>Code</FormLabel><FormControl><Input placeholder="CARD" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <DialogFooter>
                <Button type="submit" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create department"}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditDepartmentForm({
  department, pending, onClose, onSubmit,
}: {
  department: Department | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: Parameters<typeof updateDepartment>[1]) => void;
}) {
  const [v, setV] = useState({ name: "", code: "", description: "" });
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  const key = department?.id ?? null;
  if (key !== syncedKey) {
    setSyncedKey(key);
    setV({
      name: department?.name ?? "",
      code: department?.code ?? "",
      description: department?.description ?? "",
    });
  }
  return (
    <div className="flex flex-col gap-4">
      <div>
        <FormLabel>Name</FormLabel>
        <Input className="mt-1" value={v.name} onChange={(e) => setV((p) => ({ ...p, name: e.target.value }))} />
      </div>
      <div>
        <FormLabel>Code</FormLabel>
        <Input className="mt-1" value={v.code} onChange={(e) => setV((p) => ({ ...p, code: e.target.value }))} />
      </div>
      <div>
        <FormLabel>Description</FormLabel>
        <Textarea className="mt-1" value={v.description} onChange={(e) => setV((p) => ({ ...p, description: e.target.value }))} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          disabled={pending || !v.name.trim() || !v.code.trim()}
          onClick={() => onSubmit({ name: v.name.trim(), code: v.code.trim(), description: v.description.trim() || undefined })}
        >
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </DialogFooter>
    </div>
  );
}
