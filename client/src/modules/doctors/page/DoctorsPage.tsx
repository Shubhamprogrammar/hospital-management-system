"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { StethoscopeIcon, UserPlusIcon } from "lucide-react";
import { WEEKDAYS, availabilitySchema, type AvailabilityValues } from "@/modules/doctors/constant/schemas";

import { PageHeader } from "@/shared/components/layout/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
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
  createDoctor, deactivateDoctor, getDoctor, getDoctorSlots, listDoctors, listDepartments,
  markDoctorLeave, setDoctorAvailability, updateDoctor,
  type AvailabilityInput, type CreateDoctorInput, type LeaveInput,
} from "@/shared/services/org.service";
import { listUsers } from "@/shared/services/users.service";
import { ROLES } from "@/shared/types";
import type { Doctor } from "@/shared/types/domain";

const EMPTY_CREATE = { userId: "", departmentId: "", registrationNo: "", specialization: "", consultationFee: "", experienceYears: "", bio: "" };
const EMPTY_EDIT = { departmentId: "", specialization: "", consultationFee: "", experienceYears: "", bio: "", isActive: true };

export default function DoctorsPage() {
  const queryClient = useQueryClient();
  const [availabilityFor, setAvailabilityFor] = useState<Doctor | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editFor, setEditFor] = useState<Doctor | null>(null);
  const [deleteFor, setDeleteFor] = useState<Doctor | null>(null);
  const [detailFor, setDetailFor] = useState<Doctor | null>(null);
  const [leaveFor, setLeaveFor] = useState<Doctor | null>(null);
  const [slotsFor, setSlotsFor] = useState<Doctor | null>(null);
  const [slotsDate, setSlotsDate] = useState(new Date().toISOString().slice(0, 10));

  const detail = useQuery({
    queryKey: ["doctors", "detail", detailFor?.id],
    queryFn: () => getDoctor(detailFor!.id),
    enabled: !!detailFor,
  });

  const slots = useQuery({
    queryKey: ["doctors", "slots", slotsFor?.id, slotsDate],
    queryFn: () => getDoctorSlots(slotsFor!.id, { date: slotsDate }),
    enabled: !!slotsFor,
  });

  const list = useListQuery<Doctor>({ queryKey: ["doctors"], queryFn: (params) => listDoctors(params) });

  const doctors = list.data?.items ?? [];

  // Doctor-profile candidate users: DOCTOR-role users that don't already have a profile.
  const users = useQuery({
    queryKey: ["users", "doctor-picker"],
    queryFn: () => listUsers({ limit: 100 }),
    enabled: createOpen,
  });
  const departments = useQuery({
    queryKey: ["departments", "options"],
    queryFn: () => listDepartments({ limit: 100, isActive: true }),
    enabled: createOpen || !!editFor,
  });

  const candidateUsers = (users.data?.items ?? []).filter(
    (u) => u.role === ROLES.DOCTOR && !doctors.some((d) => d.userId === u.id),
  );

  const invalidateDoctors = () => queryClient.invalidateQueries({ queryKey: ["doctors"] });

  const form = useForm<AvailabilityValues>({
    resolver: zodResolver(availabilitySchema),
    defaultValues: { weekday: "1", startTime: "09:00", endTime: "17:00", slotDurationMinutes: "15", clinicRoom: "" },
  });

  const setAvailability = useMutation({
    mutationFn: ({ id, input }: { id: string; input: AvailabilityInput }) => setDoctorAvailability(id, input),
    onSuccess: () => {
      toast.success("Availability updated");
      setAvailabilityFor(null);
      queryClient.invalidateQueries({ queryKey: ["doctors"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const create = useMutation({
    mutationFn: (input: CreateDoctorInput) => createDoctor(input),
    onSuccess: () => {
      toast.success("Doctor profile created");
      setCreateOpen(false);
      invalidateDoctors();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateDoctor>[1] }) => updateDoctor(id, input),
    onSuccess: () => {
      toast.success("Doctor profile updated");
      setEditFor(null);
      invalidateDoctors();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => deactivateDoctor(id),
    onSuccess: () => {
      toast.success("Doctor profile deactivated");
      setDeleteFor(null);
      invalidateDoctors();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const leave = useMutation({
    mutationFn: ({ id, input }: { id: string; input: LeaveInput }) => markDoctorLeave(id, input),
    onSuccess: () => {
      toast.success("Leave recorded");
      setLeaveFor(null);
      invalidateDoctors();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Doctors"
        description="Doctor profiles, specializations, and availability."
        actions={<Button onClick={() => setCreateOpen(true)}><UserPlusIcon /> Add doctor</Button>}
      />

      <div className="rounded-lg border border-border bg-card">
        {list.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
          </div>
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data?.items.length === 0 ? (
          <EmptyState icon={StethoscopeIcon} title="No doctors" description="Add a doctor profile to get started — they'll then appear in appointment, lab, and prescription dropdowns." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Doctor</TableHead>
                <TableHead>Specialization</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Reg. No.</TableHead>
                <TableHead>Fee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.items.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <p className="font-medium">{d.user?.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{d.user?.email}</p>
                  </TableCell>
                  <TableCell>{d.specialization}</TableCell>
                  <TableCell className="text-muted-foreground">{d.department?.name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{d.registrationNo}</TableCell>
                  <TableCell>₹{Number(d.consultationFee)}</TableCell>
                  <TableCell><Badge variant={d.isActive ? "success" : "destructive"}>{d.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => setDetailFor(d)}>Details</Button>
                      <Button size="sm" variant="outline" onClick={() => { setAvailabilityFor(d); form.reset(); }}>Availability</Button>
                      <Button size="sm" variant="outline" onClick={() => setSlotsFor(d)}>Slots</Button>
                      <Button size="sm" variant="outline" onClick={() => setLeaveFor(d)}>Leave</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditFor(d)}>Edit</Button>
                      {d.isActive && (
                        <Button size="sm" variant="destructive" onClick={() => setDeleteFor(d)}>Deactivate</Button>
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

      {/* Doctor detail dialog */}
      <Dialog open={!!detailFor} onOpenChange={(o) => !o && setDetailFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Doctor details</DialogTitle>
            <DialogDescription>{detailFor?.user?.name}</DialogDescription>
          </DialogHeader>
          {detail.isLoading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : detail.isError ? (
            <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
          ) : detail.data ? (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-muted-foreground">Specialization</p><p className="font-medium">{detail.data.specialization}</p></div>
              <div><p className="text-muted-foreground">Department</p><p className="font-medium">{detail.data.department?.name ?? "—"}</p></div>
              <div><p className="text-muted-foreground">Reg. no.</p><p className="font-mono text-xs">{detail.data.registrationNo}</p></div>
              <div><p className="text-muted-foreground">Fee</p><p className="font-medium">₹{Number(detail.data.consultationFee)}</p></div>
              <div><p className="text-muted-foreground">Experience</p><p className="font-medium">{detail.data.experienceYears} years</p></div>
              <div><p className="text-muted-foreground">Status</p><Badge variant={detail.data.isActive ? "success" : "destructive"}>{detail.data.isActive ? "Active" : "Inactive"}</Badge></div>
              {detail.data.bio && <div className="col-span-2"><p className="text-muted-foreground">Bio</p><p className="font-medium">{detail.data.bio}</p></div>}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Slots dialog */}
      <Dialog open={!!slotsFor} onOpenChange={(o) => !o && setSlotsFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Available slots</DialogTitle>
            <DialogDescription>{slotsFor?.user?.name} · select a date to view slots</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <Input type="date" value={slotsDate} onChange={(e) => setSlotsDate(e.target.value)} />
            {slots.isLoading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : slots.isError ? (
              <ErrorState error={slots.error} onRetry={() => slots.refetch()} />
            ) : (slots.data ?? []).length === 0 ? (
              <EmptyState icon={StethoscopeIcon} title="No slots on this date" />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {slots.data?.map((s, idx) => (
                  <div key={idx} className="rounded-md border border-border px-3 py-2 text-sm">
                    <p className="font-medium">{s.startTime}–{s.endTime}</p>
                    <p className={`text-xs ${s.available ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                      {s.available ? "Available" : "Booked"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Leave dialog */}
      <Dialog open={!!leaveFor} onOpenChange={(o) => !o && setLeaveFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record leave</DialogTitle>
            <DialogDescription>{leaveFor?.user?.name}</DialogDescription>
          </DialogHeader>
          <LeaveForm
            pending={leave.isPending}
            onSubmit={(input) => leaveFor && leave.mutate({ id: leaveFor.id, input })}
          />
        </DialogContent>
      </Dialog>

      <CreateDoctorDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        candidates={candidateUsers}
        departments={departments.data?.items ?? []}
        usersLoading={users.isLoading}
        departmentsLoading={departments.isLoading}
        pending={create.isPending}
        onSubmit={(input) => create.mutate(input)}
      />

      <EditDoctorDialog
        doctor={editFor}
        onClose={() => setEditFor(null)}
        departments={departments.data?.items ?? []}
        departmentsLoading={departments.isLoading}
        pending={update.isPending}
        onSubmit={(input) => editFor && update.mutate({ id: editFor.id, input })}
      />

      <Dialog open={!!deleteFor} onOpenChange={(o) => !o && setDeleteFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Deactivate doctor</DialogTitle>
            <DialogDescription>
              Deactivate {deleteFor?.user?.name}? They will be hidden from appointment, lab, and prescription dropdowns.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteFor(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deactivate.isPending} onClick={() => deleteFor && deactivate.mutate(deleteFor.id)}>
              {deactivate.isPending ? "Deactivating…" : "Deactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!availabilityFor} onOpenChange={(o) => !o && setAvailabilityFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set availability</DialogTitle>
            <DialogDescription>{availabilityFor?.user?.name} · {availabilityFor?.specialization}</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((v) => {
                if (!availabilityFor) return;
                setAvailability.mutate({
                  id: availabilityFor.id,
                  input: { ...v, weekday: Number(v.weekday), slotDurationMinutes: Number(v.slotDurationMinutes) },
                });
              })}
              className="grid grid-cols-2 gap-4"
            >
              <FormField control={form.control} name="weekday" render={({ field }) => (
                <FormItem>
                  <FormLabel>Weekday</FormLabel>
                  <Select onValueChange={field.onChange} value={String(field.value)}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {WEEKDAYS.map((day, i) => <SelectItem key={day} value={String(i)}>{day}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="slotDurationMinutes" render={({ field }) => (
                <FormItem><FormLabel>Slot (min)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="startTime" render={({ field }) => (
                <FormItem><FormLabel>Start</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="endTime" render={({ field }) => (
                <FormItem><FormLabel>End</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="clinicRoom" render={({ field }) => (
                <FormItem className="col-span-2"><FormLabel>Clinic room</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <DialogFooter className="col-span-2">
                <Button type="submit" disabled={setAvailability.isPending}>
                  {setAvailability.isPending ? "Saving…" : "Save availability"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LeaveForm({ pending, onSubmit }: { pending: boolean; onSubmit: (input: LeaveInput) => void }) {
  const [v, setV] = useState({ startDate: "", endDate: "", reason: "" });
  const valid = v.startDate && v.endDate && v.endDate >= v.startDate;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <FormLabel>Start</FormLabel>
          <Input className="mt-1" type="date" value={v.startDate} onChange={(e) => setV((p) => ({ ...p, startDate: e.target.value }))} />
        </div>
        <div>
          <FormLabel>End</FormLabel>
          <Input className="mt-1" type="date" value={v.endDate} onChange={(e) => setV((p) => ({ ...p, endDate: e.target.value }))} />
        </div>
      </div>
      <div>
        <FormLabel>Reason (optional)</FormLabel>
        <Input className="mt-1" value={v.reason} onChange={(e) => setV((p) => ({ ...p, reason: e.target.value }))} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onSubmit({ startDate: "", endDate: "", reason: "" })} className="hidden" />
        <Button
          disabled={pending || !valid}
          onClick={() => onSubmit({ startDate: v.startDate, endDate: v.endDate, reason: v.reason.trim() || undefined })}
        >
          {pending ? "Saving…" : "Record leave"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ---------- Create dialog ----------

function CreateDoctorDialog({
  open, onOpenChange, candidates, departments, usersLoading, departmentsLoading, pending, onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: Array<{ id: string; name: string | null; email: string }>;
  departments: Array<{ id: string; name: string; code: string }>;
  usersLoading: boolean;
  departmentsLoading: boolean;
  pending: boolean;
  onSubmit: (input: CreateDoctorInput) => void;
}) {
  const [v, setV] = useState(EMPTY_CREATE);
  const set = (k: keyof typeof EMPTY_CREATE) => (value: string) => setV((prev) => ({ ...prev, [k]: value }));

  const valid = v.userId && v.departmentId && v.registrationNo.trim() && v.specialization.trim();

  const submit = () => {
    if (!valid) return;
    onSubmit({
      userId: v.userId,
      departmentId: v.departmentId,
      registrationNo: v.registrationNo.trim(),
      specialization: v.specialization.trim(),
      consultationFee: v.consultationFee ? Number(v.consultationFee) : undefined,
      experienceYears: v.experienceYears ? Number(v.experienceYears) : undefined,
      bio: v.bio.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) { setV(EMPTY_CREATE); } onOpenChange(next); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add doctor</DialogTitle>
          <DialogDescription>Link a DOCTOR-role user to a department to create their profile.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label className="text-xs">User</Label>
              <Select value={v.userId} onValueChange={set("userId")}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select user" /></SelectTrigger>
                <SelectContent>
                  {usersLoading ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">Loading…</p>
                  ) : candidates.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">No DOCTOR-role users without a profile. Create one in Users first.</p>
                  ) : candidates.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name ?? u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Department</Label>
              <Select value={v.departmentId} onValueChange={set("departmentId")}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {departmentsLoading ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">Loading…</p>
                  ) : departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Registration no.</Label>
              <Input className="mt-1" placeholder="e.g. MCI-2026-001" value={v.registrationNo} onChange={(e) => set("registrationNo")(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Specialization</Label>
              <Input className="mt-1" placeholder="e.g. Cardiology" value={v.specialization} onChange={(e) => set("specialization")(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Consultation fee (₹)</Label>
              <Input className="mt-1" type="number" min="0" value={v.consultationFee} onChange={(e) => set("consultationFee")(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Experience (years)</Label>
              <Input className="mt-1" type="number" min="0" value={v.experienceYears} onChange={(e) => set("experienceYears")(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Bio</Label>
              <Input className="mt-1" value={v.bio} onChange={(e) => set("bio")(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={!valid || pending} onClick={submit}>{pending ? "Creating…" : "Create profile"}</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Edit dialog ----------

function EditDoctorDialog({
  doctor, onClose, departments, departmentsLoading, pending, onSubmit,
}: {
  doctor: Doctor | null;
  onClose: () => void;
  departments: Array<{ id: string; name: string; code: string }>;
  departmentsLoading: boolean;
  pending: boolean;
  onSubmit: (input: { departmentId?: string; specialization?: string; consultationFee?: number; experienceYears?: number; bio?: string; isActive?: boolean }) => void;
}) {
  const [v, setV] = useState(EMPTY_EDIT);
  const set = (k: keyof typeof EMPTY_EDIT) => (value: string | boolean) => setV((prev) => ({ ...prev, [k]: value }));

  // Sync local state when the dialog opens for a different doctor.
  const key = doctor?.id ?? "none";
  const [syncedKey, setSyncedKey] = useState(key);
  if (key !== syncedKey) {
    setSyncedKey(key);
    setV({
      departmentId: doctor?.departmentId ?? "",
      specialization: doctor?.specialization ?? "",
      consultationFee: doctor?.consultationFee != null ? String(doctor.consultationFee) : "",
      experienceYears: doctor?.experienceYears != null ? String(doctor.experienceYears) : "",
      bio: doctor?.bio ?? "",
      isActive: doctor?.isActive ?? true,
    });
  }

  const submit = () => {
    onSubmit({
      departmentId: v.departmentId || undefined,
      specialization: v.specialization.trim() || undefined,
      consultationFee: v.consultationFee !== "" ? Number(v.consultationFee) : undefined,
      experienceYears: v.experienceYears !== "" ? Number(v.experienceYears) : undefined,
      bio: v.bio.trim() || undefined,
      isActive: v.isActive,
    });
  };

  return (
    <Dialog open={!!doctor} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit doctor</DialogTitle>
          <DialogDescription>{doctor?.user?.name}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label className="text-xs">Department</Label>
              <Select value={v.departmentId} onValueChange={set("departmentId")}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {departmentsLoading ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">Loading…</p>
                  ) : departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Specialization</Label>
              <Input className="mt-1" value={v.specialization} onChange={(e) => set("specialization")(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Consultation fee (₹)</Label>
              <Input className="mt-1" type="number" min="0" value={v.consultationFee} onChange={(e) => set("consultationFee")(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Experience (years)</Label>
              <Input className="mt-1" type="number" min="0" value={v.experienceYears} onChange={(e) => set("experienceYears")(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Bio</Label>
              <Input className="mt-1" value={v.bio} onChange={(e) => set("bio")(e.target.value)} />
            </div>
            <label className="col-span-2 flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-primary" checked={v.isActive} onChange={(e) => set("isActive")(e.target.checked)} />
              Active profile
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={pending} onClick={submit}>{pending ? "Saving…" : "Save changes"}</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
