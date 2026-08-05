"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { PlusIcon, SearchIcon, UserRoundIcon } from "lucide-react";
import { BLOOD_GROUPS, GENDERS, registerSchema, type RegisterValues } from "@/modules/patients/constant/schemas";

import { PageHeader } from "@/shared/components/layout/PageHeader";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
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
import { Skeleton } from "@/shared/components/ui/skeleton";
import { PaginationBar } from "@/shared/components/ui/pagination";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import { useListQuery } from "@/shared/lib/hooks/useListQuery";
import { useDebouncedValue } from "@/shared/lib/hooks/useDebouncedValue";
import { registerPatient, searchPatients, getPatient, getPatientTimeline, type RegisterPatientInput } from "@/shared/services/patients.service";
import type { Patient } from "@/shared/types/domain";

export default function PatientsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useListQuery<Patient>({
    queryKey: ["patients"],
    queryFn: (params) => searchPatients({ ...params, search: debouncedSearch || undefined }),
  });

  const selected = useQuery({
    queryKey: ["patient", selectedId],
    queryFn: () => getPatient(selectedId!),
    enabled: !!selectedId,
  });

  const timeline = useQuery({
    queryKey: ["patient", selectedId, "timeline"],
    queryFn: () => getPatientTimeline(selectedId!),
    enabled: !!selectedId,
  });

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "", dob: "", gender: "OTHER", phone: "", email: "", bloodGroup: "UNKNOWN", allergies: "", chronicConditions: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: RegisterValues) =>
      registerPatient({
        name: values.name,
        dob: values.dob,
        gender: values.gender,
        phone: values.phone,
        email: values.email || undefined,
        bloodGroup: values.bloodGroup,
        allergies: values.allergies ? values.allergies.split(",").map((s) => s.trim()).filter(Boolean) : [],
        chronicConditions: values.chronicConditions ? values.chronicConditions.split(",").map((s) => s.trim()).filter(Boolean) : [],
      } as RegisterPatientInput),
    onSuccess: () => {
      toast.success("Patient registered");
      setRegisterOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Patients"
        description="Search the master patient index or register a new patient."
        actions={
          <Button onClick={() => setRegisterOpen(true)}>
            <PlusIcon /> Register patient
          </Button>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name, UHID, or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-lg border border-border bg-card">
        {list.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data?.items.length === 0 ? (
          <EmptyState
            icon={UserRoundIcon}
            title="No patients found"
            description={debouncedSearch ? `No results for "${debouncedSearch}".` : "Register your first patient to get started."}
            action={
              <Button variant="outline" size="sm" onClick={() => setRegisterOpen(true)}>
                <PlusIcon /> Register patient
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>UHID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Gender</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Blood Group</TableHead>
                <TableHead>Registered</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.items.map((patient) => (
                <TableRow key={patient.id} className="cursor-pointer" onClick={() => setSelectedId(patient.id)}>
                  <TableCell className="font-mono text-xs">{patient.uhid}</TableCell>
                  <TableCell className="font-medium">{patient.name}</TableCell>
                  <TableCell>{patient.gender}</TableCell>
                  <TableCell>{patient.phone}</TableCell>
                  <TableCell>
                    <span className="rounded bg-accent px-1.5 py-0.5 text-xs font-medium">{patient.bloodGroup.replace(/_/g, " ")}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{new Date(patient.createdAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <div className="p-4">
          <PaginationBar meta={list.meta} onPageChange={list.setPage} />
        </div>
      </div>

      {/* Register dialog */}
      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Register patient</DialogTitle>
            <DialogDescription>Create a new record in the master patient index.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Full name</FormLabel>
                  <FormControl><Input placeholder="Jane Doe" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="dob" render={({ field }) => (
                <FormItem>
                  <FormLabel>Date of birth</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="gender" render={({ field }) => (
                <FormItem>
                  <FormLabel>Gender</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {GENDERS.map((g) => <SelectItem key={g} value={g}>{g.charAt(0) + g.slice(1).toLowerCase()}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl><Input placeholder="+1-555-000-1234" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input type="email" placeholder="jane@example.com" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="bloodGroup" render={({ field }) => (
                <FormItem>
                  <FormLabel>Blood group</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {BLOOD_GROUPS.map((bg) => (
                        <SelectItem key={bg} value={bg}>{bg.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="allergies" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Allergies (comma-separated)</FormLabel>
                  <FormControl><Input placeholder="Penicillin, Latex" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="chronicConditions" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Chronic conditions (comma-separated)</FormLabel>
                  <FormControl><Input placeholder="Diabetes, Hypertension" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter className="col-span-2">
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Registering…" : "Register patient"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Patient detail dialog */}
      <Dialog open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected.data?.name}</DialogTitle>
            <DialogDescription>
              {selected.data?.uhid} · {selected.data?.gender} · {selected.data?.bloodGroup.replace(/_/g, " ")}
            </DialogDescription>
          </DialogHeader>
          {selected.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : selected.data ? (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-muted-foreground">Phone</p><p className="font-medium">{selected.data.phone}</p></div>
              <div><p className="text-muted-foreground">Email</p><p className="font-medium">{selected.data.email ?? "—"}</p></div>
              <div><p className="text-muted-foreground">Date of birth</p><p className="font-medium">{new Date(selected.data.dob).toLocaleDateString()}</p></div>
              <div><p className="text-muted-foreground">Registered</p><p className="font-medium">{new Date(selected.data.createdAt).toLocaleDateString()}</p></div>
              <div className="col-span-2">
                <p className="text-muted-foreground">Allergies</p>
                <p className="font-medium">{selected.data.allergies.length ? selected.data.allergies.join(", ") : "None"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground">Chronic conditions</p>
                <p className="font-medium">{selected.data.chronicConditions.length ? selected.data.chronicConditions.join(", ") : "None"}</p>
              </div>
              <div className="col-span-2">
                <p className="mb-2 text-muted-foreground">Timeline</p>
                {timeline.isLoading ? (
                  <Skeleton className="h-20 w-full" />
                ) : timeline.data?.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No activity yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {timeline.data?.map((entry, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                        <span className="text-sm">{entry.description}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{new Date(entry.occurredAt).toLocaleDateString()}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <ErrorState error={selected.error} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
