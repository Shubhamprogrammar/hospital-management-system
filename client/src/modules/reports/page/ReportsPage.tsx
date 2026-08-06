"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { BarChart3Icon, CalendarClockIcon, DownloadIcon, EyeIcon, FileDownIcon, Trash2Icon } from "lucide-react";

import { PageHeader } from "@/shared/components/layout/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/shared/components/ui/table";
import { Badge } from "@/shared/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/shared/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import { StatusBadge } from "@/shared/components/feedback/StatusBadge";
import {
  createReportSchedule, deleteReportJob, downloadReportCsv, downloadReportPdf, generateReport,
  getReportJobStatus, listReportJobs, listReportSchedules, listReportTemplates,
} from "@/shared/services/reports.service";
import { buildReportSections, formatValue } from "@/shared/lib/reportResult";
import { useSession } from "@/shared/lib/auth-client";
import { ROLES, hasRole, type Role } from "@/shared/types";
import type { ReportJob } from "@/shared/types/domain";

export default function ReportsPage() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;
  const isAdmin = hasRole(role, ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN);

  const [running, setRunning] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [viewing, setViewing] = useState<ReportJob | null>(null);
  const [deleteFor, setDeleteFor] = useState<ReportJob | null>(null);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const templates = useQuery({ queryKey: ["reports", "templates"], queryFn: () => listReportTemplates({ limit: 50 }) });
  const jobsQuery = useQuery({ queryKey: ["reports", "jobs"], queryFn: () => listReportJobs(50) });
  const schedules = useQuery({ queryKey: ["reports", "schedules"], queryFn: () => listReportSchedules(), enabled: isAdmin });

  const generate = useMutation({
    mutationFn: (templateId: string) => generateReport({ templateId, dateFrom, dateTo }),
    onSuccess: (job) => {
      toast.success(job.status === "COMPLETED" ? "Report generated" : `Report queued (${job.status})`);
      setRunning(null);
      queryClient.setQueryData<ReportJob[]>(["reports", "jobs"], (prev) => [job, ...(prev ?? [])]);
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setRunning(null);
    },
  });

  const createSchedule = useMutation({
    mutationFn: (input: { templateId: string; cronExpression: string; recipients?: string[] }) =>
      createReportSchedule(input),
    onSuccess: () => {
      toast.success("Report schedule created");
      setScheduleOpen(false);
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (jobId: string) => deleteReportJob(jobId),
    onSuccess: (_data, jobId) => {
      toast.success("Report deleted");
      setDeleteFor(null);
      if (viewing?.id === jobId) setViewing(null);
      queryClient.setQueryData<ReportJob[]>(["reports", "jobs"], (prev) => (prev ?? []).filter((j) => j.id !== jobId));
      // Stop the row's status poller — it would otherwise keep hitting 404s.
      queryClient.removeQueries({ queryKey: ["reports", "job", jobId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Generate reports, monitor jobs, and schedule recurring exports."
        actions={isAdmin ? <Button onClick={() => setScheduleOpen(true)}><CalendarClockIcon /> Schedule report</Button> : undefined}
      />

      <Tabs defaultValue="generate">
        <TabsList className="mb-4">
          <TabsTrigger value="generate">Templates</TabsTrigger>
          <TabsTrigger value="jobs">Recent jobs</TabsTrigger>
          {isAdmin && <TabsTrigger value="schedules">Schedules</TabsTrigger>}
        </TabsList>

        <TabsContent value="generate">
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" className="mt-1" value={dateFrom} max={dateTo} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" className="mt-1" value={dateTo} min={dateFrom} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="ml-auto hidden text-sm text-muted-foreground sm:block">
              Applies to date-based reports
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card">
            {templates.isLoading ? (
              <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
            ) : templates.isError ? (
              <ErrorState error={templates.error} onRetry={() => templates.refetch()} />
            ) : templates.data?.items.length === 0 ? (
              <EmptyState icon={BarChart3Icon} title="No report templates" description="Configure report templates to get started." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.data?.items.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell><Badge variant="secondary">{t.module}</Badge></TableCell>
                      <TableCell className="max-w-72 truncate text-muted-foreground">{t.description ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={() => { setRunning(t.id); generate.mutate(t.id); }}
                          disabled={generate.isPending && running === t.id}
                        >
                          {generate.isPending && running === t.id ? "Generating…" : "Generate"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="jobs">
          <div className="rounded-lg border border-border bg-card">
            {jobsQuery.isLoading ? (
              <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
            ) : jobsQuery.isError ? (
              <ErrorState error={jobsQuery.error} onRetry={() => jobsQuery.refetch()} />
            ) : (jobsQuery.data ?? []).length === 0 ? (
              <EmptyState
                icon={FileDownIcon}
                title="No reports yet"
                description="Generate a report from the Templates tab — completed reports can be viewed here and downloaded as CSV."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Template</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Queued</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(jobsQuery.data ?? []).map((job) => (
                    <JobRow key={job.id} job={job} onView={setViewing} canDelete={isAdmin} onDelete={setDeleteFor} />
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="schedules">
            <div className="rounded-lg border border-border bg-card">
              {schedules.isLoading ? (
                <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
              ) : schedules.isError ? (
                <ErrorState error={schedules.error} />
              ) : (schedules.data ?? []).length === 0 ? (
                <EmptyState icon={CalendarClockIcon} title="No schedules" description="Schedule recurring report generation." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Template</TableHead>
                      <TableHead>Cron</TableHead>
                      <TableHead>Recipients</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(schedules.data ?? []).map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.template?.name ?? "—"}</TableCell>
                        <TableCell><code className="rounded bg-muted px-1.5 py-0.5 text-xs">{s.cronExpression}</code></TableCell>
                        <TableCell className="text-muted-foreground">{(s.recipients ?? []).length} recipients</TableCell>
                        <TableCell><StatusBadge status={s.isActive ? "ACTIVE" : "INACTIVE"} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={viewing !== null} onOpenChange={(open) => { if (!open) setViewing(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{viewing?.template?.name ?? "Report"} — results</DialogTitle>
            <DialogDescription>
              {viewing?.completedAt
                ? `Generated ${new Date(viewing.completedAt).toLocaleString()}`
                : "Report output"}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            <ReportResultView result={viewing?.result} />
          </div>
          <DialogFooter className="flex-wrap gap-2">
            {viewing?.status === "COMPLETED" && (
              <>
                <Button variant="outline" onClick={() => downloadReportPdf(viewing).catch((e) => toast.error(e.message))}>
                  <FileDownIcon className="size-4" /> Download PDF
                </Button>
                <Button onClick={() => downloadReportCsv(viewing.id).catch((e) => toast.error(e.message))}>
                  <DownloadIcon className="size-4" /> Download CSV
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteFor !== null} onOpenChange={(open) => { if (!open) setDeleteFor(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete report</DialogTitle>
            <DialogDescription>
              Delete “{deleteFor?.template?.name ?? "this report"}”? This permanently removes the report and its data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteFor(null)}>Cancel</Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => deleteFor && remove.mutate(deleteFor.id)}>
              {remove.isPending ? "Deleting…" : "Delete report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule report</DialogTitle>
            <DialogDescription>Generate a report on a cron schedule and email it to recipients.</DialogDescription>
          </DialogHeader>
          <ScheduleForm
            templates={templates.data?.items ?? []}
            pending={createSchedule.isPending}
            onSubmit={(input) => createSchedule.mutate(input)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Polls a generated job's status until it completes or fails. */
function JobRow({ job, onView, canDelete, onDelete }: { job: ReportJob; onView: (job: ReportJob) => void; canDelete: boolean; onDelete: (job: ReportJob) => void }) {
  const status = useQuery({
    queryKey: ["reports", "job", job.id],
    queryFn: () => getReportJobStatus(job.id),
    refetchInterval: job.status === "COMPLETED" || job.status === "FAILED" ? false : 4000,
  });
  const current = status.data ?? job;
  const done = current.status === "COMPLETED";
  return (
    <TableRow>
      <TableCell className="font-medium">{current.template?.name ?? "—"}</TableCell>
      <TableCell><StatusBadge status={current.status} /></TableCell>
      <TableCell className="text-muted-foreground">{new Date(current.createdAt).toLocaleString()}</TableCell>
      <TableCell className="text-muted-foreground">
        {current.completedAt ? new Date(current.completedAt).toLocaleString() : "—"}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          {done ? (
            <>
              <Button size="sm" variant="outline" onClick={() => onView(current)}>
                <EyeIcon className="size-3.5" /> View
              </Button>
              <Button size="sm" variant="outline" onClick={() => downloadReportPdf(current).catch((e) => toast.error(e.message))}>
                <FileDownIcon className="size-3.5" /> PDF
              </Button>
              <Button size="sm" variant="outline" onClick={() => downloadReportCsv(current.id).catch((e) => toast.error(e.message))}>
                <DownloadIcon className="size-3.5" /> CSV
              </Button>
            </>
          ) : current.status === "FAILED" ? (
            <span className="text-xs text-muted-foreground">Failed</span>
          ) : (
            <span className="text-xs text-muted-foreground">Running…</span>
          )}
          {canDelete && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              title="Delete report"
              aria-label={`Delete ${current.template?.name ?? "report"}`}
              onClick={() => onDelete(current)}
            >
              <Trash2Icon className="size-3.5" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

// ---------- Report result rendering ----------

function ResultTable({ columns, rows }: { columns: Array<{ header: string; dataKey: string }>; rows: Array<Record<string, unknown>> }) {
  if (columns.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => <TableHead key={c.dataKey}>{c.header}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {columns.map((c) => <TableCell key={c.dataKey}>{formatValue(row[c.dataKey])}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Renders a report job's persisted result: summary cards + detail tables. */
function ReportResultView({ result }: { result: unknown }) {
  const sections = buildReportSections(result);
  const hasData = sections.summary.length > 0 || sections.tables.length > 0;
  if (!hasData) return <p className="text-sm text-muted-foreground">No data was produced for this report.</p>;
  return (
    <div className="flex flex-col gap-5">
      {sections.summary.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {sections.summary.map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-muted/40 p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</div>
              <div className="mt-1 truncate text-lg font-semibold" title={formatValue(s.value)}>{formatValue(s.value)}</div>
            </div>
          ))}
        </div>
      )}
      {sections.tables.map((t) => (
        <div key={t.title}>
          <h4 className="mb-2 text-sm font-semibold text-foreground">{t.title}</h4>
          <ResultTable columns={t.columns} rows={t.rows} />
        </div>
      ))}
    </div>
  );
}

function ScheduleForm({
  templates, pending, onSubmit,
}: {
  templates: Array<{ id: string; name: string }>;
  pending: boolean;
  onSubmit: (input: { templateId: string; cronExpression: string; recipients?: string[] }) => void;
}) {
  const [templateId, setTemplateId] = useState("");
  const [cron, setCron] = useState("0 7 * * 1");
  const [recipients, setRecipients] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (templateId && cron.trim()) onSubmit({ templateId, cronExpression: cron.trim(), recipients: recipients.split(",").map((r) => r.trim()).filter(Boolean) }); }} className="flex flex-col gap-4">
      <div>
        <Label className="text-xs">Template</Label>
        <Select value={templateId} onValueChange={setTemplateId}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Select template" /></SelectTrigger>
          <SelectContent>
            {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Cron expression</Label>
        <Input className="mt-1 font-mono" value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 7 * * 1" />
      </div>
      <div>
        <Label className="text-xs">Recipients (comma-separated emails)</Label>
        <Input className="mt-1" value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="admin@hospital.com" />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending || !templateId || !cron.trim()}>{pending ? "Scheduling…" : "Create schedule"}</Button>
      </DialogFooter>
    </form>
  );
}
