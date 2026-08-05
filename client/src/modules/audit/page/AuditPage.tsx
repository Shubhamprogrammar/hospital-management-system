"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  ActivityIcon,
  DownloadIcon,
  FileSearchIcon,
  FilterIcon,
  SearchIcon,
  ShieldAlertIcon,
} from "lucide-react";

import { PageHeader } from "@/shared/components/layout/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Badge } from "@/shared/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { PaginationBar } from "@/shared/components/ui/pagination";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import { useListQuery } from "@/shared/lib/hooks/useListQuery";
import {
  exportAuditLogs,
  getEntityHistory,
  listAuditAnomalies,
  searchAuditLogs,
} from "@/shared/services/platform.service";
import type { AuditLog } from "@/shared/types/domain";

const LOG_ACTION_FILTERS = [
  "ALL",
  "CREATE",
  "UPDATE",
  "DELETE",
  "LOGIN",
  "LOGOUT",
  "APPROVE",
  "REJECT",
  "EXPORT",
  "AI_SUGGESTION_REQUESTED",
  "AI_SUGGESTION_ACCEPTED",
  "AI_SUGGESTION_EDITED",
  "AI_SUGGESTION_REJECTED",
] as const;

const ENTITY_FILTERS = [
  "ALL",
  "User",
  "Patient",
  "Prescription",
  "AiPrescriptionSuggestion",
  "AuditLog",
] as const;

const SEVERITY_FILTERS = ["ALL", "LOW", "MEDIUM", "HIGH"] as const;

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

export default function AuditPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState<(typeof LOG_ACTION_FILTERS)[number]>("ALL");
  const [entityFilter, setEntityFilter] = useState<(typeof ENTITY_FILTERS)[number]>("ALL");
  const [severityFilter, setSeverityFilter] = useState<(typeof SEVERITY_FILTERS)[number]>("ALL");
  const [dateFrom, setDateFrom] = useState(() => toDateInputValue(daysAgo(7)));
  const [dateTo, setDateTo] = useState(() => toDateInputValue(new Date()));
  const [detailFor, setDetailFor] = useState<AuditLog | null>(null);

  const logs = useListQuery<AuditLog>({
    queryKey: ["audit", "logs", searchTerm.trim(), actionFilter, entityFilter],
    queryFn: (params) =>
      searchAuditLogs({
        ...params,
        search: searchTerm.trim() || undefined,
        action: actionFilter === "ALL" ? undefined : actionFilter,
        entityType: entityFilter === "ALL" ? undefined : entityFilter,
      }),
  });
  const setPage = logs.setPage;
  const anomalies = useQuery({
    queryKey: ["audit", "anomalies", severityFilter],
    queryFn: () =>
      listAuditAnomalies({
        limit: 10,
        severity: severityFilter === "ALL" ? undefined : severityFilter,
      }),
  });

  const exportLogs = useMutation({
    mutationFn: () =>
      exportAuditLogs({
        dateFrom,
        dateTo,
        filters: {
          search: searchTerm.trim() || undefined,
          action: actionFilter === "ALL" ? undefined : actionFilter,
          entityType: entityFilter === "ALL" ? undefined : entityFilter,
          severity: severityFilter === "ALL" ? undefined : severityFilter,
        },
      }),
    onSuccess: (data) => {
      const exportId = data.jobId ?? data.id;
      toast.success(exportId ? `Export queued — job ${exportId.slice(0, 8)}` : "Export queued");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    setPage(1);
  }, [actionFilter, entityFilter, searchTerm, setPage]);

  const detail = useQuery({
    queryKey: ["audit", "detail", detailFor?.entityType, detailFor?.entityId],
    queryFn: () => getEntityHistory(detailFor!.entityType, detailFor!.entityId!),
    enabled: !!detailFor?.entityId,
  });

  const totalLogs = logs.data?.pagination?.totalItems ?? 0;
  const anomalyCount = anomalies.data?.items.length ?? 0;
  const hasFilters =
    searchTerm.trim().length > 0 ||
    actionFilter !== "ALL" ||
    entityFilter !== "ALL" ||
    severityFilter !== "ALL";

  const filterSummary = [
    searchTerm.trim() ? `“${searchTerm.trim()}”` : null,
    actionFilter !== "ALL" ? actionFilter.replace(/_/g, " ") : null,
    entityFilter !== "ALL" ? entityFilter : null,
    severityFilter !== "ALL" ? `${severityFilter} severity` : null,
  ]
    .filter(Boolean)
    .join(" • ") || "All events";

  const exportRangeValid = Boolean(dateFrom && dateTo && dateFrom <= dateTo);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        description="Immutable trail of system actions and security anomalies."
        actions={
          <Button variant="outline" disabled={exportLogs.isPending || !exportRangeValid} onClick={() => exportLogs.mutate()}>
            <DownloadIcon />
            {exportLogs.isPending ? "Exporting…" : "Export"}
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/70 bg-gradient-to-br from-sky-500/10 via-card to-card">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex size-11 items-center justify-center rounded-full bg-sky-500/10 text-sky-600">
              <ActivityIcon className="size-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total events</p>
              <p className="text-2xl font-semibold">{totalLogs.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-gradient-to-br from-amber-500/10 via-card to-card">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex size-11 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
              <ShieldAlertIcon className="size-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Anomalies</p>
              <p className="text-2xl font-semibold">{anomalyCount.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Current view</p>
            <p className="mt-1 line-clamp-2 text-sm font-medium">{filterSummary}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70">
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <CardTitle>Activity log</CardTitle>
            <Badge variant="outline" className="w-fit">
              {hasFilters ? "Filtered" : "Live feed"}
            </Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Search</label>
              <div className="relative mt-1">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Actor, action, entity, or metadata..."
                  className="pl-9"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Action</label>
              <Select value={actionFilter} onValueChange={(value) => setActionFilter(value as typeof actionFilter)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  {LOG_ACTION_FILTERS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value === "ALL" ? "All actions" : value.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Entity</label>
              <Select value={entityFilter} onValueChange={(value) => setEntityFilter(value as typeof entityFilter)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="All entities" />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_FILTERS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value === "ALL" ? "All entities" : value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={() => {
                setSearchTerm("");
                setActionFilter("ALL");
                setEntityFilter("ALL");
                setSeverityFilter("ALL");
              }}
              disabled={!hasFilters}
            >
              <FilterIcon className="size-4" />
              Clear filters
            </Button>
            {hasFilters ? <span className="text-xs text-muted-foreground">Showing {filterSummary}</span> : null}
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Export from</label>
              <Input className="mt-1" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Export to</label>
              <Input className="mt-1" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="md:col-span-2 flex items-end">
              <p className="text-xs text-muted-foreground">
                Export uses the selected date range and includes the current filters in the queued job.
              </p>
            </div>
          </div>

          {!exportRangeValid ? (
            <p className="text-xs text-destructive">Export requires a valid date range.</p>
          ) : null}
        </CardHeader>

        <CardContent className="px-0 pb-0">
          {logs.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : logs.isError ? (
            <ErrorState error={logs.error} onRetry={() => logs.refetch()} />
          ) : logs.data?.items.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={FileSearchIcon}
                title="No audit activity"
                description={hasFilters ? "Try clearing filters to see more events." : "Nothing has been recorded yet."}
              />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.data?.items.map((log) => (
                    <TableRow
                      key={log.id}
                      className={log.entityId ? "cursor-pointer align-top" : "align-top"}
                      onClick={() => log.entityId && setDetailFor(log)}
                      title={log.entityId ? "View entity history" : undefined}
                    >
                      <TableCell className="whitespace-normal font-medium">
                        <div className="flex flex-col gap-1">
                          <span>{log.actorEmail ?? "system"}</span>
                          {log.actorRole ? (
                            <span className="text-xs text-muted-foreground">
                              {log.actorRole.replace(/_/g, " ")}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <Badge variant="secondary" className="max-w-full whitespace-normal text-left font-mono text-[11px]">
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-normal text-muted-foreground">
                        <div className="flex flex-col gap-1">
                          <span>{log.entityType}</span>
                          {log.entityId ? <span className="text-xs">{log.entityId.slice(0, 8)}</span> : null}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="border-t border-border p-4">
                <PaginationBar meta={logs.meta} onPageChange={logs.setPage} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Anomalies</CardTitle>
            <Select value={severityFilter} onValueChange={(value) => setSeverityFilter(value as typeof severityFilter)}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All severities" />
              </SelectTrigger>
              <SelectContent>
                {SEVERITY_FILTERS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value === "ALL" ? "All severities" : value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          {anomalies.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : anomalies.isError ? (
            <ErrorState error={anomalies.error} />
          ) : anomalies.data?.items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No anomalies detected.</p>
          ) : (
            <div className="space-y-3">
              {anomalies.data?.items.map((a) => (
                <div
                  key={a.id}
                  className="rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:bg-muted/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{a.actorEmail ?? "system"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {a.action} · {a.entityType}
                      </p>
                    </div>
                    <Badge
                      variant={a.severity === "HIGH" ? "destructive" : a.severity === "MEDIUM" ? "warning" : "secondary"}
                    >
                      {a.severity}
                    </Badge>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {new Date(a.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detailFor} onOpenChange={(open) => !open && setDetailFor(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Entity history</DialogTitle>
            <DialogDescription>
              {detailFor?.entityType}:{detailFor?.entityId?.slice(0, 8)} · click rows in the log to drill down.
            </DialogDescription>
          </DialogHeader>

          {detail.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : detail.isError ? (
            <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
          ) : (detail.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No further activity for this entity.
            </p>
          ) : (
            <div className="max-h-96 space-y-2 overflow-y-auto">
              {(detail.data ?? []).map((entry) => (
                <div key={entry.id} className="rounded-md border border-border px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {entry.actorEmail ?? "system"} · <code className="text-xs">{entry.action}</code>
                    </p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {entry.metadata ? (
                    <pre className="mt-2 overflow-x-auto rounded bg-muted/50 p-2 text-xs">
                      {JSON.stringify(entry.metadata, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
