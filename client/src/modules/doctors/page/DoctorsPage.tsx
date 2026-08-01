"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { StethoscopeIcon } from "lucide-react";
import { WEEKDAYS, availabilitySchema, type AvailabilityValues } from "@/modules/doctors/constant/schemas";

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
import { listDoctors, setDoctorAvailability, type AvailabilityInput } from "@/shared/services/org.service";
import type { Doctor } from "@/shared/types/domain";

export default function DoctorsPage() {
  const queryClient = useQueryClient();
  const [availabilityFor, setAvailabilityFor] = useState<Doctor | null>(null);

  const list = useListQuery<Doctor>({ queryKey: ["doctors"], queryFn: (params) => listDoctors(params) });

  const form = useForm<AvailabilityValues>({
    resolver: zodResolver(availabilitySchema),
    defaultValues: { weekday: "1", startTime: "09:00", endTime: "17:00", slotDurationMinutes: "15", clinicRoom: "" },
  });

  const setAvailability = useMutation({
    mutationFn: ({ id, input }: { id: string; input: AvailabilityInput }) => setDoctorAvailability(id, input),
    onSuccess: () => {
      toast.success("Availability updated");
      setAvailabilityFor(null);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["doctors"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader title="Doctors" description="Doctor profiles, specializations, and availability." />

      <div className="rounded-lg border border-border bg-card">
        {list.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
          </div>
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data?.items.length === 0 ? (
          <EmptyState icon={StethoscopeIcon} title="No doctors" description="Doctor profiles appear here once assigned." />
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
                    <Button size="sm" variant="outline" onClick={() => { setAvailabilityFor(d); form.reset(); }}>Availability</Button>
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
