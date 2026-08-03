"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import { createRole, deleteRole, listPermissions, listRoles } from "@/shared/services/users.service";

export default function RolesPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const roles = useQuery({ queryKey: ["roles"], queryFn: () => listRoles() });
  const permissions = useQuery({ queryKey: ["permissions"], queryFn: () => listPermissions() });

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
                    {!r.isSystem && (
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove.mutate(r.id)}>Delete</Button>
                    )}
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
    </div>
  );
}
