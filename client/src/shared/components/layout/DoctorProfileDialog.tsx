"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { CalendarIcon, PencilIcon, StethoscopeIcon } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import {
  getDoctorSlots,
  listDepartments,
  markDoctorLeave,
  setDoctorAvailability,
  updateDoctor,
  type Doctor,
} from "@/shared/services/org.service";
import { WEEKDAYS } from "@/modules/doctors/constant/schemas";

const EMPTY_EDIT = { departmentId: "", specialization: "", consultationFee: "", experienceYears: "", bio: "" };
const EMPTY_AVAILABILITY = { weekday: "1", startTime: "09:00", endTime: "17:00", slotDurationMinutes: "15", clinicRoom: "" };
const EMPTY_LEAVE = { startDate: "", endDate: "", reason: "" };

export function DoctorProfileDialog({
  open,
  onOpenChange,
  doctorProfile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctorProfile: Doctor | null;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("overview");
  const [slotsDate, setSlotsDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [edit, setEdit] = useState(() => ({
    ...EMPTY_EDIT,
    departmentId: doctorProfile?.departmentId ?? "",
    specialization: doctorProfile?.specialization ?? "",
    consultationFee: doctorProfile?.consultationFee != null ? String(doctorProfile.consultationFee) : "",
    experienceYears: doctorProfile?.experienceYears != null ? String(doctorProfile.experienceYears) : "",
    bio: doctorProfile?.bio ?? "",
  }));
  const [availability, setAvailability] = useState(EMPTY_AVAILABILITY);
  const [leave, setLeave] = useState(EMPTY_LEAVE);

  const departments = useQuery({
    queryKey: ["departments", "options"],
    queryFn: () => listDepartments({ limit: 100, isActive: true }),
    enabled: open && (tab === "edit" || tab === "availability"),
  });

  const slots = useQuery({
    queryKey: ["doctors", "slots", doctorProfile?.id, slotsDate],
    queryFn: () => getDoctorSlots(doctorProfile!.id, { date: slotsDate }),
    enabled: open && tab === "slots" && !!doctorProfile,
  });

  const update = useMutation({
    mutationFn: () => {
      if (!doctorProfile) throw new Error("Doctor profile not loaded");
      return updateDoctor(doctorProfile.id, {
        departmentId: edit.departmentId || undefined,
        specialization: edit.specialization.trim() || undefined,
        consultationFee: edit.consultationFee !== "" ? Number(edit.consultationFee) : undefined,
        experienceYears: edit.experienceYears !== "" ? Number(edit.experienceYears) : undefined,
        bio: edit.bio.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Doctor profile updated");
      queryClient.invalidateQueries({ queryKey: ["doctors", "me"] });
      queryClient.invalidateQueries({ queryKey: ["doctors"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveAvailability = useMutation({
    mutationFn: () => {
      if (!doctorProfile) throw new Error("Doctor profile not loaded");
      return setDoctorAvailability(doctorProfile.id, {
        slots: [
          {
            weekday: Number(availability.weekday),
            startTime: availability.startTime,
            endTime: availability.endTime,
            slotDurationMinutes: availability.slotDurationMinutes ? Number(availability.slotDurationMinutes) : undefined,
            clinicRoom: availability.clinicRoom.trim() || undefined,
          },
        ],
      });
    },
    onSuccess: () => {
      toast.success("Availability updated");
      queryClient.invalidateQueries({ queryKey: ["doctors", "me"] });
      queryClient.invalidateQueries({ queryKey: ["doctors"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const leaveMutation = useMutation({
    mutationFn: () => {
      if (!doctorProfile) throw new Error("Doctor profile not loaded");
      return markDoctorLeave(doctorProfile.id, {
        startDate: leave.startDate,
        endDate: leave.endDate,
        reason: leave.reason.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Leave recorded");
      queryClient.invalidateQueries({ queryKey: ["doctors", "me"] });
      queryClient.invalidateQueries({ queryKey: ["doctors"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusVariant = doctorProfile?.isActive ? "success" : "destructive";
  const leaveValid = leave.startDate && leave.endDate && leave.endDate >= leave.startDate;
  const availabilityValid = availability.weekday && availability.startTime && availability.endTime;

  const slotsContent = useMemo(() => slots.data?.slots ?? [], [slots.data]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Doctor profile</DialogTitle>
          <DialogDescription>{doctorProfile?.user?.name ?? "Your profile"}</DialogDescription>
        </DialogHeader>

        {!doctorProfile ? (
          <EmptyState icon={StethoscopeIcon} title="No doctor profile yet" description="Create your doctor profile from the Doctors page." />
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="flex flex-col gap-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="edit"><PencilIcon className="size-4" /> Edit</TabsTrigger>
              <TabsTrigger value="availability">Availability</TabsTrigger>
              <TabsTrigger value="slots"><CalendarIcon className="size-4" /> Slots</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Name" value={doctorProfile.user?.name ?? "—"} />
                <Field label="Email" value={doctorProfile.user?.email ?? "—"} />
                <Field label="Specialization" value={doctorProfile.specialization} />
                <Field label="Department" value={doctorProfile.department?.name ?? "—"} />
                <Field label="Registration no." value={doctorProfile.registrationNo} mono />
                <Field label="Consultation fee" value={`₹${Number(doctorProfile.consultationFee)}`} />
                <Field label="Experience" value={`${doctorProfile.experienceYears} years`} />
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant={statusVariant}>{doctorProfile.isActive ? "Active" : "Inactive"}</Badge>
                </div>
                {doctorProfile.bio && <div className="md:col-span-2"><Field label="Bio" value={doctorProfile.bio} /></div>}
              </div>
            </TabsContent>

            <TabsContent value="edit" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Label className="text-xs">Department</Label>
                  <Select value={edit.departmentId} onValueChange={(value) => setEdit((p) => ({ ...p, departmentId: value }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select department" /></SelectTrigger>
                    <SelectContent>
                      {departments.isLoading ? (
                        <p className="px-3 py-2 text-sm text-muted-foreground">Loading…</p>
                      ) : departments.data?.items.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <InputField label="Specialization" value={edit.specialization} onChange={(v) => setEdit((p) => ({ ...p, specialization: v }))} />
                <InputField label="Consultation fee (₹)" type="number" min="0" value={edit.consultationFee} onChange={(v) => setEdit((p) => ({ ...p, consultationFee: v }))} />
                <InputField label="Experience (years)" type="number" min="0" value={edit.experienceYears} onChange={(v) => setEdit((p) => ({ ...p, experienceYears: v }))} />
                <div className="md:col-span-2">
                  <Label className="text-xs">Bio</Label>
                  <Input className="mt-1" value={edit.bio} onChange={(e) => setEdit((p) => ({ ...p, bio: e.target.value }))} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setTab("overview")}>Cancel</Button>
                <Button disabled={update.isPending} onClick={() => update.mutate()}>
                  {update.isPending ? "Saving…" : "Save changes"}
                </Button>
              </DialogFooter>
            </TabsContent>

            <TabsContent value="availability" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label className="text-xs">Weekday</Label>
                  <Select value={availability.weekday} onValueChange={(value) => setAvailability((p) => ({ ...p, weekday: value }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map((day, index) => <SelectItem key={day} value={String(index)}>{day}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <InputField label="Slot duration (min)" type="number" min="0" value={availability.slotDurationMinutes} onChange={(v) => setAvailability((p) => ({ ...p, slotDurationMinutes: v }))} />
                <InputField label="Start time" type="time" value={availability.startTime} onChange={(v) => setAvailability((p) => ({ ...p, startTime: v }))} />
                <InputField label="End time" type="time" value={availability.endTime} onChange={(v) => setAvailability((p) => ({ ...p, endTime: v }))} />
                <div className="md:col-span-2">
                  <Label className="text-xs">Clinic room</Label>
                  <Input className="mt-1" value={availability.clinicRoom} onChange={(e) => setAvailability((p) => ({ ...p, clinicRoom: e.target.value }))} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setTab("overview")}>Cancel</Button>
                <Button disabled={saveAvailability.isPending || !availabilityValid} onClick={() => saveAvailability.mutate()}>
                  {saveAvailability.isPending ? "Saving…" : "Save availability"}
                </Button>
              </DialogFooter>
            </TabsContent>

            <TabsContent value="slots" className="space-y-4">
              <InputField label="Date" type="date" value={slotsDate} onChange={setSlotsDate} />
              {slots.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading slots…</p>
              ) : slots.isError ? (
                <ErrorState error={slots.error} onRetry={() => slots.refetch()} />
              ) : slots.data?.onLeave ? (
                <EmptyState icon={CalendarIcon} title="Doctor is on leave" />
              ) : slotsContent.length === 0 ? (
                <EmptyState icon={CalendarIcon} title="No slots on this date" />
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {slotsContent.map((slot, index) => (
                    <div key={index} className="rounded-md border border-border px-3 py-2 text-sm">
                      <p className="font-medium">{slot.startTime} - {slot.endTime}</p>
                      <p className={`text-xs ${slot.available ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                        {slot.available ? "Available" : "Booked"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

          </Tabs>
        )}

        {doctorProfile && (
          <div className="space-y-4 border-t border-border pt-4">
            <div className="grid gap-4 md:grid-cols-2">
              <InputField label="Leave start" type="date" value={leave.startDate} onChange={(v) => setLeave((p) => ({ ...p, startDate: v }))} />
              <InputField label="Leave end" type="date" value={leave.endDate} onChange={(v) => setLeave((p) => ({ ...p, endDate: v }))} />
              <div className="md:col-span-2">
                <Label className="text-xs">Leave reason</Label>
                <Input className="mt-1" value={leave.reason} onChange={(e) => setLeave((p) => ({ ...p, reason: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTab("overview")}>Back</Button>
              <Button disabled={leaveMutation.isPending || !leaveValid} onClick={() => leaveMutation.mutate()}>
                {leaveMutation.isPending ? "Saving…" : "Record leave"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={mono ? "font-mono text-xs" : "font-medium"}>{value}</p>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
  min,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: string | number;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input className="mt-1" type={type} min={min} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
