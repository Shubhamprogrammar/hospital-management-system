"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { BarChart3Icon, CalendarClockIcon, ClockIcon } from "lucide-react";

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
  createReportSchedule, generateReport, getReportJobStatus, listReportSchedules, listReportTemplates,
} from "@/shared/services/reports.service";
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
  const [jobs, setJobs] = useState<ReportJob[]>([]);

  const templates = useQuery({ queryKey: ["reports", "templates"], queryFn: () => listReportTemplates({ limit: 50 }) });
  const schedules = useQuery({ queryKey: ["reports", "schedules"], queryFn: () => listReportSchedules(), enabled: isAdmin });

  const generate = useMutation({
    mutationFn: (templateId: string) => generateReport({ templateId }),
    onSuccess: (job) => {
      toast.success(`Report queued (${job.status})`);
      setRunning(null);
      setJobs((prev) => [job, ...prev]);
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
            {jobs.length === 0 ? (
              <EmptyState icon={ClockIcon} title="No jobs this session" description="Generated reports appear here with live status." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Template</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Queued</TableHead>
                    <TableHead>Completed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <JobRow key={job.id} job={job} />
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
function JobRow({ job }: { job: ReportJob }) {
  const status = useQuery({
    queryKey: ["reports", "job", job.id],
    queryFn: () => getReportJobStatus(job.id),
    refetchInterval: job.status === "COMPLETED" || job.status === "FAILED" ? false : 4000,
  });
  const current = status.data ?? job;
  return (
    <TableRow>
      <TableCell className="font-medium">{current.template?.name ?? "—"}</TableCell>
      <TableCell><StatusBadge status={current.status} /></TableCell>
      <TableCell className="text-muted-foreground">{new Date(current.createdAt).toLocaleString()}</TableCell>
      <TableCell className="text-muted-foreground">
        {current.completedAt ? new Date(current.completedAt).toLocaleString() : "—"}
      </TableCell>
    </TableRow>
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
