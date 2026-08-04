"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { CalendarClockIcon, PlusIcon } from "lucide-react";
import { APPOINTMENT_STATUSES, bookSchema, type BookValues } from "@/modules/appointments/constant/schemas";

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
import { StatusBadge } from "@/shared/components/feedback/StatusBadge";
import { useListQuery } from "@/shared/lib/hooks/useListQuery";
import {
  bookAppointment, cancelAppointment, checkInAppointment, listAppointments, rescheduleAppointment,
} from "@/shared/services/appointments.service";
import { listDepartments, listDoctors } from "@/shared/services/org.service";
import { searchPatients } from "@/shared/services/patients.service";
import type { Appointment, AppointmentStatus } from "@/shared/types/domain";

export default function AppointmentsPage() {
  const queryClient = useQueryClient();
  const [bookOpen, setBookOpen] = useState(false);
  const [rescheduleFor, setRescheduleFor] = useState<Appointment | null>(null);
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | "">("");

  const list = useListQuery<Appointment>({
    queryKey: ["appointments", statusFilter],
    queryFn: (params) => listAppointments({ ...params, status: statusFilter || undefined }),
  });

  const patients = useQuery({ queryKey: ["patients", "options"], queryFn: () => searchPatients({ limit: 50 }) });
  const doctors = useQuery({ queryKey: ["doctors", "options"], queryFn: () => listDoctors({ limit: 50 }) });
  const departments = useQuery({ queryKey: ["departments", "options"], queryFn: () => listDepartments({ limit: 50 }) });

  const form = useForm<BookValues>({
    resolver: zodResolver(bookSchema),
    defaultValues: { patientId: "", doctorId: "", departmentId: "", appointmentDate: "", slotStartTime: "09:00", slotEndTime: "09:30", mode: "IN_PERSON", reason: "" },
  });

  const book = useMutation({
    mutationFn: (v: BookValues) => bookAppointment(v),
    onSuccess: () => {
      toast.success("Appointment booked");
      setBookOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const checkIn = useMutation({
    mutationFn: (id: string) => checkInAppointment(id),
    onSuccess: () => {
      toast.success("Checked in");
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelAppointment(id),
    onSuccess: () => {
      toast.success("Appointment cancelled");
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reschedule = useMutation({
    mutationFn: ({ id, input }: { id: string; input: { appointmentDate: string; slotStartTime: string; slotEndTime: string } }) =>
      rescheduleAppointment(id, input),
    onSuccess: () => {
      toast.success("Appointment rescheduled");
      setRescheduleFor(null);
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Appointments"
        description="Book, manage, and check in patient visits."
        actions={
          <Button onClick={() => setBookOpen(true)}>
            <PlusIcon /> Book appointment
          </Button>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === "ALL" ? "" : (v as AppointmentStatus))}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {APPOINTMENT_STATUSES.map((s) => (
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
          <EmptyState icon={CalendarClockIcon} title="No appointments" description="Book a visit to get started." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead>Date & Time</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.items.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <p className="font-medium">{a.patient?.name ?? "—"}</p>
                    <p className="font-mono text-xs text-muted-foreground">{a.patient?.uhid}</p>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">{a.doctor?.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{a.department?.name}</p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <p className="text-sm">{new Date(a.appointmentDate).toLocaleDateString()}</p>
                    <p className="text-xs text-muted-foreground">{a.slotStartTime} – {a.slotEndTime}</p>
                  </TableCell>
                  <TableCell><Badge variant="outline">{a.mode.replace(/_/g, " ")}</Badge></TableCell>
                  <TableCell><StatusBadge status={a.status} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {(a.status === "CONFIRMED") && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => checkIn.mutate(a.id)}>Check in</Button>
                          <Button size="sm" variant="outline" onClick={() => setRescheduleFor(a)}>Reschedule</Button>
                        </>
                      )}
                      {(a.status === "CONFIRMED" || a.status === "CHECKED_IN") && (
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => cancel.mutate(a.id)}>Cancel</Button>
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

      <Dialog open={bookOpen} onOpenChange={setBookOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Book appointment</DialogTitle>
            <DialogDescription>Reserve a time slot for a patient with a doctor.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => book.mutate(v))} className="grid grid-cols-2 gap-4">
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
              <FormField control={form.control} name="doctorId" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Doctor</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {doctors.data?.items.map((d) => <SelectItem key={d.id} value={d.id}>{d.user?.name} — {d.specialization}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="departmentId" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Department</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {departments.data?.items.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="appointmentDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="mode" render={({ field }) => (
                <FormItem>
                  <FormLabel>Mode</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="IN_PERSON">In person</SelectItem>
                      <SelectItem value="TELECONSULT">Teleconsult</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="slotStartTime" render={({ field }) => (
                <FormItem>
                  <FormLabel>Start time</FormLabel>
                  <FormControl><Input type="time" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="slotEndTime" render={({ field }) => (
                <FormItem>
                  <FormLabel>End time</FormLabel>
                  <FormControl><Input type="time" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="reason" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Reason (optional)</FormLabel>
                  <FormControl><Input placeholder="Fever, follow-up…" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter className="col-span-2">
                <Button type="submit" disabled={book.isPending}>{book.isPending ? "Booking…" : "Book appointment"}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Reschedule dialog */}
      <Dialog open={!!rescheduleFor} onOpenChange={(o) => !o && setRescheduleFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reschedule appointment</DialogTitle>
            <DialogDescription>
              {rescheduleFor?.patient?.name} with {rescheduleFor?.doctor?.name ?? "doctor"} · currently{" "}
              {rescheduleFor ? new Date(rescheduleFor.appointmentDate).toLocaleDateString() : ""} {rescheduleFor?.slotStartTime}–{rescheduleFor?.slotEndTime}
            </DialogDescription>
          </DialogHeader>
          <RescheduleForm
            defaults={{
              appointmentDate: rescheduleFor?.appointmentDate ? rescheduleFor.appointmentDate.slice(0, 10) : "",
              slotStartTime: rescheduleFor?.slotStartTime ?? "09:00",
              slotEndTime: rescheduleFor?.slotEndTime ?? "09:30",
            }}
            pending={reschedule.isPending}
            onSubmit={(input) => rescheduleFor && reschedule.mutate({ id: rescheduleFor.id, input })}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RescheduleForm({
  defaults, pending, onSubmit,
}: {
  defaults: { appointmentDate: string; slotStartTime: string; slotEndTime: string };
  pending: boolean;
  onSubmit: (input: { appointmentDate: string; slotStartTime: string; slotEndTime: string }) => void;
}) {
  const [v, setV] = useState(defaults);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (v.appointmentDate && v.slotStartTime && v.slotEndTime) onSubmit(v);
      }}
      className="flex flex-col gap-4"
    >
      <div className="grid gap-1.5">
        <FormLabel>Date</FormLabel>
        <Input type="date" value={v.appointmentDate} onChange={(e) => setV((p) => ({ ...p, appointmentDate: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-1.5">
          <FormLabel>Start</FormLabel>
          <Input type="time" value={v.slotStartTime} onChange={(e) => setV((p) => ({ ...p, slotStartTime: e.target.value }))} />
        </div>
        <div className="grid gap-1.5">
          <FormLabel>End</FormLabel>
          <Input type="time" value={v.slotEndTime} onChange={(e) => setV((p) => ({ ...p, slotEndTime: e.target.value }))} />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending || !v.appointmentDate}>
          {pending ? "Rescheduling…" : "Reschedule"}
        </Button>
      </DialogFooter>
    </form>
  );
}
