"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { PlusIcon, ShieldAlertIcon } from "lucide-react";
import { roleSchema, type RoleValues } from "@/modules/roles/constant/schemas";

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
import { Label } from "@/shared/components/ui/label";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import { createRole, deleteRole, getRole, listPermissions, listRoles, updateRole } from "@/shared/services/users.service";
import type { Role } from "@/shared/types/domain";

export default function RolesPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editFor, setEditFor] = useState<Role | null>(null);

  const roles = useQuery({ queryKey: ["roles"], queryFn: () => listRoles() });
  const permissions = useQuery({ queryKey: ["permissions"], queryFn: () => listPermissions() });

  const [detailFor, setDetailFor] = useState<string | null>(null);
  const detail = useQuery({
    queryKey: ["roles", "detail", detailFor],
    queryFn: () => getRole(detailFor!),
    enabled: !!detailFor,
  });

  const form = useForm<RoleValues>({
    resolver: zodResolver(roleSchema),
    defaultValues: { name: "", description: "", permissionKeys: [] },
  });
  const watchedPermissionKeys = useWatch({ control: form.control, name: "permissionKeys" });

  const create = useMutation({
    mutationFn: (v: RoleValues) => createRole({ name: v.name, description: v.description, permissionKeys: v.permissionKeys }),
    onSuccess: () => {
      toast.success("Role created");
      setCreateOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteRole(id),
    onSuccess: () => {
      toast.success("Role deleted");
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const edit = useMutation({
    mutationFn: ({ id, input }: { id: string; input: { name?: string; description?: string; permissionKeys?: string[] } }) =>
      updateRole(id, input),
    onSuccess: () => {
      toast.success("Role updated");
      setEditFor(null);
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        description="Manage access roles and their permissions."
        actions={<Button onClick={() => setCreateOpen(true)}><PlusIcon /> Create role</Button>}
      />

      <div className="rounded-lg border border-border bg-card">
        {roles.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
          </div>
        ) : roles.isError ? (
          <ErrorState error={roles.error} onRetry={() => roles.refetch()} />
        ) : roles.data?.items.length === 0 ? (
          <EmptyState icon={ShieldAlertIcon} title="No roles" description="Create roles to define access." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.data?.items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-muted-foreground">{r.description ?? "—"}</TableCell>
                  <TableCell><Badge variant={r.isSystem ? "secondary" : "outline"}>{r.isSystem ? "System" : "Custom"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setDetailFor(r.id)}>View</Button>
                      {!r.isSystem && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setEditFor(r)}>Edit</Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove.mutate(r.id)}>Delete</Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Create role</DialogTitle>
            <DialogDescription>Define a custom access role.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="flex flex-col gap-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Role name</FormLabel><FormControl><Input placeholder="CASUALTY_OFFICER" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-1.5 overflow-y-auto rounded-md border border-border p-2 max-h-52">
                {permissions.data?.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={watchedPermissionKeys.includes(p.key)}
                      onChange={(e) => {
                        const current = form.getValues("permissionKeys");
                        form.setValue(
                          "permissionKeys",
                          e.target.checked ? [...current, p.key] : current.filter((k) => k !== p.key),
                        );
                      }}
                    />
                    <span className="truncate">{p.module}.{p.key}</span>
                  </label>
                ))}
              </div>
              <DialogFooter>
                <Button type="submit" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create role"}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <EditRoleDialog
        role={editFor}
        permissions={permissions.data ?? []}
        pending={edit.isPending}
        onClose={() => setEditFor(null)}
        onSubmit={(input) => editFor && edit.mutate({ id: editFor.id, input })}
      />

      {detailFor && <RoleDetailDialog detail={detail} onClose={() => setDetailFor(null)} />}
    </div>
  );
}

// ---------- Role detail dialog ----------

function RoleDetailDialog({
  detail, onClose,
}: {
  detail: UseQueryResult<Role, Error>;
  onClose: () => void;
}) {
  const role = detail.data;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{role?.name}</DialogTitle>
          <DialogDescription>
            {role?.isSystem ? "System role" : "Custom role"}{role?.description ? ` · ${role.description}` : ""}
          </DialogDescription>
        </DialogHeader>
        {detail.isLoading ? (
          <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}</div>
        ) : detail.isError ? (
          <ErrorState error={detail.error} />
        ) : role ? (
          <div>
            <p className="mb-2 text-sm font-medium">Permissions ({role.rolePermissions?.length ?? 0})</p>
            {(role.rolePermissions ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No permissions assigned.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(role.rolePermissions ?? []).map((rp) => (
                  <code key={rp.permission.id} className="rounded bg-muted px-2 py-1 text-xs">
                    {rp.permission.module}.{rp.permission.key}
                  </code>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EditRoleDialog({
  role, permissions, pending, onClose, onSubmit,
}: {
  role: Role | null;
  permissions: Array<{ id: string; key: string; module: string }>;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: { name?: string; description?: string; permissionKeys?: string[] }) => void;
}) {
  const [v, setV] = useState({ name: "", description: "", permissionKeys: [] as string[] });
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  const key = role?.id ?? null;
  if (key !== syncedKey) {
    setSyncedKey(key);
    setV({
      name: role?.name ?? "",
      description: role?.description ?? "",
      permissionKeys: role?.rolePermissions?.map((rp) => rp.permission.key) ?? [],
    });
  }

  return (
    <Dialog open={!!role} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit role</DialogTitle>
          <DialogDescription>{role?.name}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Role name</Label>
              <Input className="mt-1" value={v.name} onChange={(e) => setV((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea className="mt-1" value={v.description} onChange={(e) => setV((p) => ({ ...p, description: e.target.value }))} />
            </div>
          </div>
          <div className="grid max-h-52 grid-cols-2 gap-1.5 overflow-y-auto rounded-md border border-border p-2">
            {permissions.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={v.permissionKeys.includes(p.key)}
                  onChange={(e) =>
                    setV((prev) => ({
                      ...prev,
                      permissionKeys: e.target.checked
                        ? [...prev.permissionKeys, p.key]
                        : prev.permissionKeys.filter((k) => k !== p.key),
                    }))
                  }
                />
                <span className="truncate">{p.module}.{p.key}</span>
              </label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={pending || !v.name.trim()}
            onClick={() =>
              onSubmit({
                name: v.name.trim(),
                description: v.description.trim() || undefined,
                permissionKeys: v.permissionKeys,
              })
            }
          >
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
