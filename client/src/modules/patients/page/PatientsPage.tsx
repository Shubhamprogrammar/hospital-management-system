"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import {
  DownloadIcon, GitMergeIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon, UploadIcon, UserRoundIcon,
} from "lucide-react";
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
import { Label } from "@/shared/components/ui/label";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { PaginationBar } from "@/shared/components/ui/pagination";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import { useListQuery } from "@/shared/lib/hooks/useListQuery";
import { useDebouncedValue } from "@/shared/lib/hooks/useDebouncedValue";
import {
  addPatientDocument, getPatient, getPatientMe, getPatientTimeline, mergePatients,
  registerPatient, removePatientDocument, searchPatients, updatePatient, type RegisterPatientInput,
} from "@/shared/services/patients.service";
import { confirmUpload, getDownloadUrl, presignUpload } from "@/shared/services/platform.service";
import { useSession } from "@/shared/lib/auth-client";
import { hasRole, ROLES, type Role } from "@/shared/types";
import type { Patient, PatientDocument } from "@/shared/types/domain";

export default function PatientsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editFor, setEditFor] = useState<Patient | null>(null);
  const [docOpen, setDocOpen] = useState(false);
  const [mergeFor, setMergeFor] = useState<Patient | null>(null);
  const [meOpen, setMeOpen] = useState(false);
  // PatientDocument.id -> FileUpload.id for docs uploaded in this session.
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, string>>({});
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;
  const isPatientRole = hasRole(role, ROLES.PATIENT);
  const isAdminRole = hasRole(role, ROLES.SUPER_ADMIN) || hasRole(role, ROLES.HOSPITAL_ADMIN);

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

  // Patient portal — the logged-in patient's own record.
  const me = useQuery({ queryKey: ["patient", "me"], queryFn: () => getPatientMe(), enabled: meOpen });

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

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updatePatient>[1] }) => updatePatient(id, input),
    onSuccess: () => {
      toast.success("Patient updated");
      setEditFor(null);
      queryClient.invalidateQueries({ queryKey: ["patient", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const merge = useMutation({
    mutationFn: (input: { survivingPatientId: string; mergedPatientId: string; reason: string }) => mergePatients(input),
    onSuccess: () => {
      toast.success("Patients merged");
      setMergeFor(null);
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadDoc = useMutation({
    mutationFn: async ({ file, docType }: { file: File; docType: PatientDocument["docType"] }) => {
      const presign = await presignUpload({
        uploadContext: "PATIENT_DOC",
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      });
      // Push bytes to the presigned (S3) URL. Local dev returns a confirm-route stub, so skip the PUT.
      if (presign.uploadUrl && !presign.uploadUrl.includes("/api/v1/")) {
        await fetch(presign.uploadUrl, { method: "PUT", body: file });
      }
      await confirmUpload(presign.fileId);
      const doc = await addPatientDocument(selectedId!, { docType, s3Key: presign.s3Key });
      return { doc, fileId: presign.fileId };
    },
    onSuccess: ({ doc, fileId }) => {
      toast.success("Document uploaded");
      setDocOpen(false);
      setUploadedFiles((prev) => ({ ...prev, [doc.id]: fileId }));
      queryClient.invalidateQueries({ queryKey: ["patient", selectedId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const download = useMutation({
    mutationFn: (fileId: string) => getDownloadUrl(fileId),
    onSuccess: (res) => window.open(res.downloadUrl, "_blank"),
    onError: (e: Error) => toast.error(e.message),
  });

  const removeDoc = useMutation({
    mutationFn: ({ docId }: { docId: string }) => removePatientDocument(selectedId!, docId),
    onSuccess: (_result, { docId }) => {
      toast.success("Document deleted");
      // Drop the session-scoped file link (download) for the removed doc.
      setUploadedFiles((prev) => {
        const next = { ...prev };
        delete next[docId];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["patient", selectedId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Patients"
        description="Search the master patient index or register a new patient."
        actions={
          <>
            {isPatientRole && (
              <Button variant="outline" onClick={() => setMeOpen(true)}>
                My record
              </Button>
            )}
            <Button onClick={() => setRegisterOpen(true)}>
              <PlusIcon /> Register patient
            </Button>
          </>
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
      <Dialog
        open={!!selectedId}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
            setDocOpen(false);
            setMergeFor(null);
          }
        }}
      >
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
            <>
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

              <div className="col-span-2">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-muted-foreground">Documents</p>
                  <Button size="sm" variant="outline" onClick={() => setDocOpen(true)}>
                    <UploadIcon /> Upload
                  </Button>
                </div>
                {(selected.data.documents ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No documents yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {selected.data.documents?.map((doc) => {
                      const fileId = uploadedFiles[doc.id];
                      const canDelete = isAdminRole || doc.uploadedBy === session?.user?.id;
                      return (
                        <li key={doc.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{doc.s3Key.split("/").pop()}</p>
                            <p className="text-xs text-muted-foreground">
                              {doc.docType.replace(/_/g, " ")} · {new Date(doc.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                      <div className="flex shrink-0 gap-1">
                        {fileId && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            title="Download"
                            onClick={() => download.mutate(fileId)}
                          >
                            <DownloadIcon className="size-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 text-destructive"
                            title="Delete"
                            disabled={removeDoc.isPending}
                            onClick={() => removeDoc.mutate({ docId: doc.id })}
                          >
                            <Trash2Icon className="size-4" />
                          </Button>
                        )}
                      </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <DialogFooter className="justify-between">
              <Button variant="outline" onClick={() => setMergeFor(selected.data!)}>
                <GitMergeIcon /> Merge duplicate
              </Button>
              <Button onClick={() => setEditFor(selected.data!)}>
                <PencilIcon /> Edit record
              </Button>
            </DialogFooter>
            </>
          ) : (
            <ErrorState error={selected.error} />
          )}
        </DialogContent>
      </Dialog>

      <EditPatientDialog
        patient={editFor}
        pending={update.isPending}
        onClose={() => setEditFor(null)}
        onSubmit={(input) => editFor && update.mutate({ id: editFor.id, input })}
      />

      {docOpen && selected.data && (
        <UploadDocumentDialog
          patientName={selected.data.name}
          pending={uploadDoc.isPending}
          onClose={() => setDocOpen(false)}
          onSubmit={(input) => uploadDoc.mutate(input)}
        />
      )}

      {mergeFor && (
        <MergePatientDialog
          patient={mergeFor}
          patients={list.data?.items ?? []}
          pending={merge.isPending}
          onClose={() => setMergeFor(null)}
          onSubmit={(input) => merge.mutate(input)}
        />
      )}

      {/* My patient record (patient portal) */}
      <Dialog open={meOpen} onOpenChange={(o) => !o && setMeOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>My patient record</DialogTitle>
            <DialogDescription>Your record in the master patient index.</DialogDescription>
          </DialogHeader>
          {me.isLoading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : me.isError ? (
            <ErrorState error={me.error} />
          ) : me.data ? (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-muted-foreground">UHID</p><p className="font-mono text-xs font-medium">{me.data.uhid}</p></div>
              <div><p className="text-muted-foreground">Name</p><p className="font-medium">{me.data.name}</p></div>
              <div><p className="text-muted-foreground">Date of birth</p><p className="font-medium">{new Date(me.data.dob).toLocaleDateString()}</p></div>
              <div><p className="text-muted-foreground">Blood group</p><p className="font-medium">{me.data.bloodGroup.replace(/_/g, " ")}</p></div>
              <div><p className="text-muted-foreground">Phone</p><p className="font-medium">{me.data.phone}</p></div>
              <div><p className="text-muted-foreground">Email</p><p className="font-medium">{me.data.email ?? "—"}</p></div>
              <div className="col-span-2">
                <p className="text-muted-foreground">Allergies</p>
                <p className="font-medium">{me.data.allergies.length ? me.data.allergies.join(", ") : "None"}</p>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Edit patient dialog ----------

function EditPatientDialog({
  patient, pending, onClose, onSubmit,
}: {
  patient: Patient | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: Parameters<typeof updatePatient>[1]) => void;
}) {
  const [v, setV] = useState({ name: "", phone: "", email: "", bloodGroup: "UNKNOWN", allergies: "", chronicConditions: "" });
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  const key = patient?.id ?? null;
  if (key !== syncedKey) {
    setSyncedKey(key);
    setV({
      name: patient?.name ?? "",
      phone: patient?.phone ?? "",
      email: patient?.email ?? "",
      bloodGroup: patient?.bloodGroup ?? "UNKNOWN",
      allergies: (patient?.allergies ?? []).join(", "),
      chronicConditions: (patient?.chronicConditions ?? []).join(", "),
    });
  }

  return (
    <Dialog open={!!patient} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit patient</DialogTitle>
          <DialogDescription>{patient?.uhid} · {patient?.name}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Full name</Label>
            <Input className="mt-1" value={v.name} onChange={(e) => setV((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input className="mt-1" value={v.phone} onChange={(e) => setV((p) => ({ ...p, phone: e.target.value }))} />
          </div>
          <div>
            <Label>Email</Label>
            <Input className="mt-1" type="email" value={v.email} onChange={(e) => setV((p) => ({ ...p, email: e.target.value }))} />
          </div>
          <div>
            <Label>Blood group</Label>
            <Select value={v.bloodGroup} onValueChange={(bg) => setV((p) => ({ ...p, bloodGroup: bg }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BLOOD_GROUPS.map((bg) => <SelectItem key={bg} value={bg}>{bg.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div />
          <div className="col-span-2">
            <Label>Allergies (comma-separated)</Label>
            <Input className="mt-1" value={v.allergies} onChange={(e) => setV((p) => ({ ...p, allergies: e.target.value }))} />
          </div>
          <div className="col-span-2">
            <Label>Chronic conditions (comma-separated)</Label>
            <Input className="mt-1" value={v.chronicConditions} onChange={(e) => setV((p) => ({ ...p, chronicConditions: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={pending || !v.name.trim()}
            onClick={() =>
              onSubmit({
                name: v.name.trim(),
                phone: v.phone.trim() || undefined,
                email: v.email.trim() || undefined,
                bloodGroup: v.bloodGroup as RegisterPatientInput["bloodGroup"],
                allergies: v.allergies.split(",").map((s) => s.trim()).filter(Boolean),
                chronicConditions: v.chronicConditions.split(",").map((s) => s.trim()).filter(Boolean),
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

// ---------- Upload document dialog ----------

function UploadDocumentDialog({
  patientName, pending, onClose, onSubmit,
}: {
  patientName: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: { file: File; docType: PatientDocument["docType"] }) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<PatientDocument["docType"]>("OTHER");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
          <DialogDescription>Attach a scanned ID, insurance policy, or other record for {patientName}.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div>
            <Label>Document type</Label>
            <Select value={docType} onValueChange={(v) => setDocType(v as PatientDocument["docType"])}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ID_PROOF">ID proof</SelectItem>
                <SelectItem value="INSURANCE">Insurance</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>File</Label>
            <Input
              type="file"
              className="mt-1"
              accept="image/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="mt-1 text-xs text-muted-foreground">PDF or image, up to 25 MB.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={pending || !file} onClick={() => file && onSubmit({ file, docType })}>
            {pending ? "Uploading…" : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Merge duplicate patients dialog ----------

function MergePatientDialog({
  patient, patients, pending, onClose, onSubmit,
}: {
  patient: Patient;
  patients: Patient[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: { survivingPatientId: string; mergedPatientId: string; reason: string }) => void;
}) {
  const [duplicateId, setDuplicateId] = useState("");
  const [reason, setReason] = useState("");
  const candidates = patients.filter((p) => p.id !== patient.id);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Merge duplicate patient</DialogTitle>
          <DialogDescription>
            {patient.uhid} · {patient.name} will survive; the duplicate&apos;s records move into it.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div>
            <Label>Duplicate patient</Label>
            <Select value={duplicateId} onValueChange={setDuplicateId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select duplicate record…" /></SelectTrigger>
              <SelectContent>
                {candidates.map((p) => <SelectItem key={p.id} value={p.id}>{p.uhid} · {p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {candidates.length === 0 && <p className="mt-1 text-xs text-muted-foreground">No other patients to merge with.</p>}
          </div>
          <div>
            <Label>Reason</Label>
            <Input className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Duplicate registration" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={pending || !duplicateId || !reason.trim()}
            onClick={() => onSubmit({ survivingPatientId: patient.id, mergedPatientId: duplicateId, reason: reason.trim() })}
          >
            {pending ? "Merging…" : "Merge records"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
