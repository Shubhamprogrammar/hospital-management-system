"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { CalendarClockIcon, CheckIcon, PlusIcon, RefreshCwIcon, SearchIcon, XIcon } from "lucide-react";
import {
  APPOINTMENT_STATUSES,
  bookSchema,
  isFutureBooking,
  requestSchema,
  type BookValues,
  type RequestValues,
} from "@/modules/appointments/constant/schemas";

import { PageHeader } from "@/shared/components/layout/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
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
import { StatusBadge } from "@/shared/components/feedback/StatusBadge";
import { useListQuery } from "@/shared/lib/hooks/useListQuery";
import {
  approveAppointment, bookAppointment, cancelAppointment, checkInAppointment, completeAppointment, getAppointment,
  getAppointmentQueue, listAppointments, rejectAppointment, rescheduleAppointment,
} from "@/shared/services/appointments.service";
import { listDepartments, listDoctors } from "@/shared/services/org.service";
import { searchPatients } from "@/shared/services/patients.service";
import { useSession } from "@/shared/lib/auth-client";
import { ROLES, type Role } from "@/shared/types";
import type { Appointment, AppointmentStatus, Department, Doctor } from "@/shared/types/domain";

export default function AppointmentsPage() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;
  const isPatient = role === ROLES.PATIENT;
  const isDoctor = role === ROLES.DOCTOR;
  const isReviewer = role === ROLES.RECEPTIONIST || role === ROLES.HOSPITAL_ADMIN || role === ROLES.SUPER_ADMIN;

  const [bookOpen, setBookOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [rescheduleFor, setRescheduleFor] = useState<Appointment | null>(null);
  const [detailFor, setDetailFor] = useState<Appointment | null>(null);
  const [rejectFor, setRejectFor] = useState<Appointment | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | "">("");
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [doctorFilter, setDoctorFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const hasFilters = !!(statusFilter || search || departmentFilter || doctorFilter || dateFilter);
  const resetFilters = () => {
    setStatusFilter("");
    setSearch("");
    setDepartmentFilter("");
    setDoctorFilter("");
    setDateFilter("");
  };

  const detail = useQuery({
    queryKey: ["appointments", "detail", detailFor?.id],
    queryFn: () => getAppointment(detailFor!.id),
    enabled: !!detailFor,
  });

  const queue = useQuery({
    queryKey: ["appointments", "queue"],
    queryFn: () => getAppointmentQueue({}),
    enabled: queueOpen,
    // "Live" list: keep refreshing while the dialog is open so check-ins,
    // completions and new bookings appear without reopening it.
    refetchInterval: queueOpen ? 15_000 : false,
    refetchOnWindowFocus: queueOpen,
  });

  // Pending requests awaiting receptionist review (reviewers only).
  const pending = useQuery({
    queryKey: ["appointments", "pending"],
    queryFn: () => listAppointments({ status: "PENDING", page: 1, limit: 50 }),
    enabled: isReviewer,
  });

  const list = useListQuery<Appointment>({
    queryKey: ["appointments", statusFilter, departmentFilter, doctorFilter, dateFilter, search],
    queryFn: (params) => listAppointments({
      ...params,
      status: statusFilter || undefined,
      departmentId: departmentFilter || undefined,
      doctorId: doctorFilter || undefined,
      date: dateFilter || undefined,
      search: search || undefined,
    }),
  });

  const patients = useQuery({ queryKey: ["patients", "options"], queryFn: () => searchPatients({ limit: 50 }), enabled: !isPatient });
  const doctors = useQuery({ queryKey: ["doctors", "options"], queryFn: () => listDoctors({ limit: 50 }) });
  const departments = useQuery({ queryKey: ["departments", "options"], queryFn: () => listDepartments({ limit: 50 }) });

  const form = useForm<BookValues>({
    resolver: zodResolver(bookSchema),
    defaultValues: { patientId: "", doctorId: "", departmentId: "", appointmentDate: "", slotStartTime: "09:00", slotEndTime: "09:30", mode: "IN_PERSON", reason: "" },
  });

  const requestForm = useForm<RequestValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: { doctorId: "", departmentId: "", appointmentDate: "", slotStartTime: "09:00", slotEndTime: "09:30", mode: "IN_PERSON", reason: "" },
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

  const request = useMutation({
    mutationFn: (v: RequestValues) => bookAppointment(v),
    onSuccess: () => {
      toast.success("Request submitted — you'll be notified once it's approved");
      setRequestOpen(false);
      requestForm.reset();
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: (id: string) => approveAppointment(id),
    onSuccess: () => {
      toast.success("Request approved — patient & doctor notified");
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["appointments", "pending"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => rejectAppointment(id, { decisionNote: note }),
    onSuccess: () => {
      toast.success("Request rejected — patient notified");
      setRejectFor(null);
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["appointments", "pending"] });
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

  const complete = useMutation({
    mutationFn: (id: string) => completeAppointment(id),
    onSuccess: () => {
      toast.success("Marked as done");
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
      toast.success(isPatient ? "Reschedule requested — pending review" : "Appointment rescheduled");
      setRescheduleFor(null);
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      if (isPatient) queryClient.invalidateQueries({ queryKey: ["appointments", "pending"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title={isPatient ? "My Appointments" : "Appointments"}
        description={isPatient
          ? "Request a visit with a doctor and track its status. Approved requests become bookings."
          : isDoctor
            ? "Your appointment schedule. Search, filter, and mark consultations as done."
            : "Book, review, approve, and check in patient visits."}
        actions={
          <>
            {isReviewer && <Button variant="outline" onClick={() => setQueueOpen(true)}>Queue</Button>}
            {isPatient ? (
              <Button onClick={() => setRequestOpen(true)}>
                <PlusIcon /> Request appointment
              </Button>
            ) : isReviewer ? (
              <Button onClick={() => setBookOpen(true)}>
                <PlusIcon /> Book appointment
              </Button>
            ) : null}
          </>
        }
      />

      {isReviewer && (
        <div className="mb-4 rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <p className="font-medium">Pending requests</p>
            <p className="text-xs text-muted-foreground">
              Requests from patients awaiting approval. Availability is re-checked when you approve.
            </p>
          </div>
          {pending.isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : pending.isError ? (
            <ErrorState error={pending.error} onRetry={() => pending.refetch()} />
          ) : (pending.data?.items ?? []).length === 0 ? (
            <EmptyState icon={CalendarClockIcon} title="No pending requests" description="New patient requests will appear here." />
          ) : (
            <ul className="divide-y divide-border">
              {pending.data?.items.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{a.patient?.name ?? "—"} <span className="font-mono text-xs text-muted-foreground">{a.patient?.uhid}</span></p>
                    <p className="text-xs text-muted-foreground">
                      {a.doctor?.name ?? "Doctor"} · {a.department?.name} · {new Date(a.appointmentDate).toLocaleDateString()} {a.slotStartTime}–{a.slotEndTime}
                      {a.reason ? <> · “{a.reason}”</> : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="outline" onClick={() => setDetailFor(a)}>Details</Button>
                    <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate(a.id)}>
                      <CheckIcon /> Approve
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" disabled={reject.isPending} onClick={() => setRejectFor(a)}>
                      <XIcon /> Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isPatient ? "Search doctor…" : "Search patient, UHID, doctor…"}
            className="w-60 pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === "ALL" ? "" : (v as AppointmentStatus))}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {APPOINTMENT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isReviewer && (
          <Select value={doctorFilter} onValueChange={(v) => setDoctorFilter(v === "ALL" ? "" : v)}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All doctors" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All doctors</SelectItem>
              {doctors.data?.items.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.user?.name ?? d.id} — {d.specialization}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={departmentFilter} onValueChange={(v) => setDepartmentFilter(v === "ALL" ? "" : v)}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All departments" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All departments</SelectItem>
            {departments.data?.items.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="w-40" />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>Clear filters</Button>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card">
        {list.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
          </div>
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data?.items.length === 0 ? (
          <EmptyState icon={CalendarClockIcon} title="No appointments" description={isPatient ? "Request a visit to get started." : "Book a visit to get started."} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isPatient ? "Doctor" : "Patient"}</TableHead>
                <TableHead>{isPatient ? "Department" : "Doctor"}</TableHead>
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
                    {isPatient ? (
                      <>
                        <p className="font-medium">{a.doctor?.name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{a.doctor?.specialization}</p>
                      </>
                    ) : (
                      <>
                        <p className="font-medium">{a.patient?.name ?? "—"}</p>
                        <p className="font-mono text-xs text-muted-foreground">{a.patient?.uhid}</p>
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    {isPatient ? (
                      <p className="text-sm">{a.department?.name}</p>
                    ) : (
                      <>
                        <p className="text-sm">{a.doctor?.name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{a.department?.name}</p>
                      </>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <p className="text-sm">{new Date(a.appointmentDate).toLocaleDateString()}</p>
                    <p className="text-xs text-muted-foreground">{a.slotStartTime} – {a.slotEndTime}</p>
                  </TableCell>
                  <TableCell><Badge variant="outline">{a.mode.replace(/_/g, " ")}</Badge></TableCell>
                  <TableCell>
                    <StatusBadge status={a.status} />
                    {a.status === "REJECTED" && a.decisionNote && (
                      <p className="mt-1 max-w-40 text-xs text-muted-foreground">{a.decisionNote}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => setDetailFor(a)}>Details</Button>
                      {a.status === "BOOKED" && (
                        <>
                          {isReviewer && <Button size="sm" variant="outline" onClick={() => checkIn.mutate(a.id)}>Check in</Button>}
                          {!isPatient && <Button size="sm" variant="outline" onClick={() => complete.mutate(a.id)}>Mark done</Button>}
                          {!isDoctor && <Button size="sm" variant="outline" onClick={() => setRescheduleFor(a)}>Reschedule</Button>}
                        </>
                      )}
                      {a.status === "CHECKED_IN" && !isPatient && (
                        <Button size="sm" variant="outline" onClick={() => complete.mutate(a.id)}>Mark done</Button>
                      )}
                      {!isDoctor && (a.status === "BOOKED" || a.status === "CHECKED_IN") && (
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

      {/* Staff: book appointment dialog */}
      {isReviewer && (
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
                <AppointmentFields doctors={doctors.data?.items} departments={departments.data?.items} />
                <DialogFooter className="col-span-2">
                  <Button type="submit" disabled={book.isPending}>{book.isPending ? "Booking…" : "Book appointment"}</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      )}

      {/* Patient: request appointment dialog */}
      {isPatient && (
        <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Request an appointment</DialogTitle>
              <DialogDescription>
                Pick a doctor and time. Your request goes to the reception for approval — you will be notified of the decision.
              </DialogDescription>
            </DialogHeader>
            <Form {...requestForm}>
              <form onSubmit={requestForm.handleSubmit((v) => request.mutate(v))} className="grid grid-cols-2 gap-4">
                <AppointmentFields doctors={doctors.data?.items} departments={departments.data?.items} />
                <DialogFooter className="col-span-2">
                  <Button type="submit" disabled={request.isPending}>{request.isPending ? "Submitting…" : "Submit request"}</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      )}

      {/* Detail dialog */}
      <Dialog open={!!detailFor} onOpenChange={(o) => !o && setDetailFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Appointment details</DialogTitle>
            <DialogDescription>
              {detailFor?.patient?.name ?? detailFor?.doctor?.name} · {detailFor ? new Date(detailFor.appointmentDate).toLocaleDateString() : ""} {detailFor?.slotStartTime}–{detailFor?.slotEndTime}
            </DialogDescription>
          </DialogHeader>
          {detail.isLoading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : detail.isError ? (
            <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
          ) : detail.data ? (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-muted-foreground">Patient</p><p className="font-medium">{detail.data.patient?.name} · {detail.data.patient?.uhid}</p></div>
              <div><p className="text-muted-foreground">Doctor</p><p className="font-medium">{detail.data.doctor?.name ?? "—"} ({detail.data.department?.name ?? "—"})</p></div>
              <div><p className="text-muted-foreground">Mode</p><p className="font-medium">{detail.data.mode.replace(/_/g, " ")}</p></div>
              <div><p className="text-muted-foreground">Status</p><StatusBadge status={detail.data.status} /></div>
              <div className="col-span-2"><p className="text-muted-foreground">Reason</p><p className="font-medium">{detail.data.reason ?? "—"}</p></div>
              {detail.data.decisionNote && (
                <div className="col-span-2"><p className="text-muted-foreground">Reviewer note</p><p className="font-medium">{detail.data.decisionNote}</p></div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Queue dialog (staff) */}
      {isReviewer && (
        <Dialog open={queueOpen} onOpenChange={setQueueOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Appointment queue</DialogTitle>
              <DialogDescription>Live waiting list across departments.</DialogDescription>
            </DialogHeader>
            {queue.isLoading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : queue.isError ? (
              <ErrorState error={queue.error} onRetry={() => queue.refetch()} />
            ) : (queue.data ?? []).length === 0 ? (
              <EmptyState icon={CalendarClockIcon} title="No one is waiting right now" description="Booked and checked-in patients for today will appear here as the queue builds." />
            ) : (
              <div className="space-y-4">
                {groupByDepartment(queue.data ?? []).map(({ department, items }) => (
                  <div key={department.id}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="text-sm font-semibold">{department.name}</p>
                      <p className="text-xs text-muted-foreground">{items.length} waiting</p>
                    </div>
                    <div className="space-y-2">
                      {items.map((a) => (
                        <div key={a.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-4 py-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              {a.patient?.name ?? "—"} <span className="font-mono text-xs text-muted-foreground">{a.patient?.uhid}</span>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {a.doctor?.name ?? "Doctor"} · {a.slotStartTime}–{a.slotEndTime}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <StatusBadge status={a.status} />
                            {a.opdVisit && <p className="mt-0.5 text-xs text-muted-foreground">Token {a.opdVisit.tokenNumber}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <DialogFooter>
              <p className="mr-auto text-xs text-muted-foreground">
                {queue.dataUpdatedAt ? `Updated ${new Date(queue.dataUpdatedAt).toLocaleTimeString()}` : "Live"}
              </p>
              <Button variant="outline" size="sm" disabled={queue.isFetching} onClick={() => queue.refetch()}>
                <RefreshCwIcon className={queue.isFetching ? "animate-spin" : ""} /> Refresh
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Reject dialog (staff) */}
      {isReviewer && (
        <RejectDialog
          appointment={rejectFor}
          pending={reject.isPending}
          onClose={() => setRejectFor(null)}
          onSubmit={(note) => rejectFor && reject.mutate({ id: rejectFor.id, note })}
        />
      )}

      {/* Reschedule dialog */}
      <Dialog open={!!rescheduleFor} onOpenChange={(o) => !o && setRescheduleFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reschedule appointment</DialogTitle>
            <DialogDescription>
              {rescheduleFor?.patient?.name ?? rescheduleFor?.doctor?.name} with {rescheduleFor?.doctor?.name ?? "doctor"} · currently{" "}
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

/** Local today's date as YYYY-MM-DD (min for date pickers). */
function todayStr() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().split("T")[0];
}

/** Group queue entries by department, preserving the server's order (checked-in first). */
function groupByDepartment(items: Appointment[]) {
  const groups = new Map<string, { department: { id: string; name?: string | null }; items: Appointment[] }>();
  for (const a of items) {
    const deptId = a.department?.id ?? "unknown";
    const existing = groups.get(deptId);
    if (existing) {
      existing.items.push(a);
    } else {
      groups.set(deptId, { department: a.department ?? { id: deptId }, items: [a] });
    }
  }
  return Array.from(groups.values());
}

/** Shared department/doctor/date/slot/mode fields for both dialogs. */
function AppointmentFields({ doctors, departments }: { doctors: Doctor[] | undefined; departments: Department[] | undefined }) {
  return (
    <>
      <FormField name="departmentId" render={({ field }) => (
        <FormItem className="col-span-2">
          <FormLabel>Department</FormLabel>
          <Select onValueChange={field.onChange} value={field.value}>
            <FormControl><SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger></FormControl>
            <SelectContent>
              {departments?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )} />
      <FormField name="doctorId" render={({ field }) => (
        <FormItem className="col-span-2">
          <FormLabel>Doctor</FormLabel>
          <Select onValueChange={field.onChange} value={field.value}>
            <FormControl><SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger></FormControl>
            <SelectContent>
              {doctors?.map((d) => <SelectItem key={d.id} value={d.id}>{d.user?.name ?? d.id} — {d.specialization}</SelectItem>)}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )} />
      <FormField name="appointmentDate" render={({ field }) => (
        <FormItem>
          <FormLabel>Date</FormLabel>
          <FormControl><Input type="date" min={todayStr()} {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
      <FormField name="mode" render={({ field }) => (
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
      <FormField name="slotStartTime" render={({ field }) => (
        <FormItem>
          <FormLabel>Start time</FormLabel>
          <FormControl><Input type="time" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
      <FormField name="slotEndTime" render={({ field }) => (
        <FormItem>
          <FormLabel>End time</FormLabel>
          <FormControl><Input type="time" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
      <FormField name="reason" render={({ field }) => (
        <FormItem className="col-span-2">
          <FormLabel>Reason (optional)</FormLabel>
          <FormControl><Input placeholder="Fever, follow-up…" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
    </>
  );
}

function RejectDialog({
  appointment, pending, onClose, onSubmit,
}: {
  appointment: Appointment | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <Dialog open={!!appointment} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reject request</DialogTitle>
          <DialogDescription>
            {appointment?.patient?.name} with {appointment?.doctor?.name ?? "doctor"} ·{" "}
            {appointment ? new Date(appointment.appointmentDate).toLocaleDateString() : ""} {appointment?.slotStartTime}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label>Reason for rejection</Label>
          <Textarea
            rows={3}
            placeholder="Doctor unavailable, slot conflict, etc."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">This reason is shown to the patient.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" disabled={pending || !note.trim()} onClick={() => onSubmit(note.trim())}>
            {pending ? "Rejecting…" : "Reject request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
        if (!v.appointmentDate || !v.slotStartTime || !v.slotEndTime) return;
        if (!isFutureBooking(v.appointmentDate, v.slotStartTime)) {
          toast.error("Appointment date and slot must be in the future");
          return;
        }
        onSubmit(v);
      }}
      className="flex flex-col gap-4"
    >
      <div className="grid gap-1.5">
        <Label>Date</Label>
        <Input type="date" min={todayStr()} value={v.appointmentDate} onChange={(e) => setV((p) => ({ ...p, appointmentDate: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-1.5">
          <Label>Start</Label>
          <Input type="time" value={v.slotStartTime} onChange={(e) => setV((p) => ({ ...p, slotStartTime: e.target.value }))} />
        </div>
        <div className="grid gap-1.5">
          <Label>End</Label>
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
