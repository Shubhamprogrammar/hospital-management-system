"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { PlusIcon, UserRoundIcon } from "lucide-react";
import { userSchema, type UserValues } from "@/modules/users/constant/schemas";

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
import {
  bulkImportUsers, createUser, deactivateUser, listUsers, updateUser, uploadAvatar,
} from "@/shared/services/users.service";
import { ROLES, type User } from "@/shared/types";

const ROLE_OPTIONS = Object.values(ROLES);

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editFor, setEditFor] = useState<User | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const list = useListQuery<User>({ queryKey: ["users"], queryFn: (params) => listUsers(params) });

  const form = useForm<UserValues>({
    resolver: zodResolver(userSchema),
    defaultValues: { name: "", email: "", password: "", role: "", phone: "" },
  });

  const create = useMutation({
    mutationFn: (v: UserValues) => createUser(v),
    onSuccess: () => {
      toast.success("User created");
      setCreateOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => deactivateUser(id),
    onSuccess: () => {
      toast.success("User deactivated");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const edit = useMutation({
    mutationFn: ({ id, input }: { id: string; input: { name?: string; phone?: string; role?: string; isActive?: boolean } }) =>
      updateUser(id, input),
    onSuccess: () => {
      toast.success("User updated");
      setEditFor(null);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulk = useMutation({
    mutationFn: (users: Array<{ name: string; email: string; password: string; role: string; phone?: string }>) => bulkImportUsers(users),
    onSuccess: (result) => {
      toast.success(`${result.imported} users imported`);
      setBulkOpen(false);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Users"
        description="Manage staff accounts and roles."
        actions={
          <>
            <Button variant="outline" onClick={() => setBulkOpen(true)}>Bulk import</Button>
            <Button onClick={() => setCreateOpen(true)}><PlusIcon /> Create user</Button>
          </>
        }
      />

      <div className="rounded-lg border border-border bg-card">
        {list.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
          </div>
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data?.items.length === 0 ? (
          <EmptyState icon={UserRoundIcon} title="No users" description="Create staff accounts to get started." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.items.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell><Badge variant="secondary">{u.role.replace(/_/g, " ")}</Badge></TableCell>
                  <TableCell>{u.phone ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={(u as User & { isActive?: boolean }).isActive === false ? "destructive" : "success"}>
                      {(u as User & { isActive?: boolean }).isActive === false ? "Inactive" : "Active"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => setEditFor(u)}>Edit</Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deactivate.mutate(u.id)}>
                        Deactivate
                      </Button>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create user</DialogTitle>
            <DialogDescription>Provision a new staff account.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="flex flex-col gap-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Full name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem><FormLabel>Password</FormLabel><FormControl><Input type="password" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="role" render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {ROLE_OPTIONS.map((role) => <SelectItem key={role} value={role}>{role.replace(/_/g, " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="submit" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create user"}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <EditUserDialog
        user={editFor}
        pending={edit.isPending}
        onClose={() => setEditFor(null)}
        onSubmit={(input) => editFor && edit.mutate({ id: editFor.id, input })}
      />

      <BulkImportDialog open={bulkOpen} onOpenChange={setBulkOpen} pending={bulk.isPending} onSubmit={(users) => bulk.mutate(users)} />
    </div>
  );
}

function EditUserDialog({
  user, pending, onClose, onSubmit,
}: {
  user: User | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: { name?: string; phone?: string; role?: string; isActive?: boolean }) => void;
}) {
  const [v, setV] = useState({ name: "", phone: "", role: "", isActive: true });
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  const key = user?.id ?? null;
  if (key !== syncedKey) {
    setSyncedKey(key);
    setV({
      name: user?.name ?? "",
      phone: user?.phone ?? "",
      role: user?.role ?? "",
      isActive: (user as User & { isActive?: boolean }).isActive !== false,
    });
  }

  const avatar = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return uploadAvatar(user!.id, formData);
    },
    onSuccess: () => { toast.success("Avatar uploaded"); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>{user?.email}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div>
            <FormLabel>Full name</FormLabel>
            <Input className="mt-1" value={v.name} onChange={(e) => setV((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FormLabel>Phone</FormLabel>
              <Input className="mt-1" value={v.phone} onChange={(e) => setV((p) => ({ ...p, phone: e.target.value }))} />
            </div>
            <div>
              <FormLabel>Role</FormLabel>
              <Select value={v.role} onValueChange={(r) => setV((p) => ({ ...p, role: r }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((role) => <SelectItem key={role} value={role}>{role.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={v.isActive}
              onChange={(e) => setV((p) => ({ ...p, isActive: e.target.checked }))}
            />
            Active account
          </label>
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              id="avatar-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) avatar.mutate(file);
                e.currentTarget.value = "";
              }}
            />
            <Button type="button" variant="outline" size="sm" disabled={avatar.isPending} onClick={() => document.getElementById("avatar-input")?.click()}>
              {avatar.isPending ? "Uploading…" : "Upload avatar"}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={pending || !v.name.trim() || !v.role}
            onClick={() => onSubmit({ name: v.name.trim(), phone: v.phone || undefined, role: v.role, isActive: v.isActive })}
          >
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkImportDialog({
  open, onOpenChange, pending, onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onSubmit: (users: Array<{ name: string; email: string; password: string; role: string; phone?: string }>) => void;
}) {
  const [text, setText] = useState("");
  const parse = () => {
    const trimmed = text.trim();
    let parsed: Array<{ name: string; email: string; password: string; role: string; phone?: string }> = [];
    try {
      const json = JSON.parse(trimmed);
      if (Array.isArray(json)) parsed = json;
    } catch {
      // Fall back to CSV lines: name, email, password, role
      parsed = trimmed.split(/\n/).map((line) => {
        const [name, email, password, role, phone] = line.split(",").map((s) => s.trim());
        return { name, email, password, role, phone };
      }).filter((u) => u.name && u.email && u.password && u.role);
    }
    return parsed;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk import users</DialogTitle>
          <DialogDescription>Paste a JSON array or CSV lines: name, email, password, role[, phone].</DialogDescription>
        </DialogHeader>
        <textarea
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'[{"name":"Jane Doe","email":"jane@hospital.com","password":"temp1234","role":"NURSE"}]\n\nOR\n\nJane Doe, jane@hospital.com, temp1234, NURSE'}
          className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-primary"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={pending || parse().length === 0} onClick={() => onSubmit(parse())}>
            {pending ? "Importing…" : `Import ${parse().length} user${parse().length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
