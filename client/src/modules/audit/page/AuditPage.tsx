"use client";

import { useQuery } from "@tanstack/react-query";
import { FileSearchIcon } from "lucide-react";

import { PageHeader } from "@/shared/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Badge } from "@/shared/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/shared/components/ui/table";
import { PaginationBar } from "@/shared/components/ui/pagination";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import { useListQuery } from "@/shared/lib/hooks/useListQuery";
import { listAuditAnomalies, searchAuditLogs } from "@/shared/services/platform.service";
import type { AuditLog } from "@/shared/types/domain";

export default function AuditPage() {
  const logs = useListQuery<AuditLog>({ queryKey: ["audit", "logs"], queryFn: (params) => searchAuditLogs(params) });
  const anomalies = useQuery({ queryKey: ["audit", "anomalies"], queryFn: () => listAuditAnomalies({ limit: 10 }) });

  return (
    <div>
      <PageHeader title="Audit Logs" description="Immutable trail of system actions and security anomalies." />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Activity log</CardTitle></CardHeader>
          <CardContent className="px-0 pb-0">
            {logs.isLoading ? (
              <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : logs.isError ? (
              <ErrorState error={logs.error} onRetry={() => logs.refetch()} />
            ) : logs.data?.items.length === 0 ? (
              <EmptyState icon={FileSearchIcon} title="No audit activity" />
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
                      <TableRow key={log.id}>
                        <TableCell className="font-medium">{log.actorEmail ?? "system"}</TableCell>
                        <TableCell><code className="rounded bg-muted px-1.5 py-0.5 text-xs">{log.action}</code></TableCell>
                        <TableCell className="text-muted-foreground">{log.entityType}{log.entityId ? `:${log.entityId.slice(0, 8)}` : ""}</TableCell>
                        <TableCell className="text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="p-4">
                  <PaginationBar meta={logs.meta} onPageChange={logs.setPage} />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Anomalies</CardTitle></CardHeader>
          <CardContent>
            {anomalies.isLoading ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : anomalies.isError ? (
              <ErrorState error={anomalies.error} />
            ) : anomalies.data?.items.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No anomalies detected.</p>
            ) : (
              <div className="space-y-3">
                {anomalies.data?.items.map((a) => (
                  <div key={a.id} className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{a.actorEmail ?? "system"}</p>
                      <Badge variant={a.severity === "HIGH" ? "destructive" : a.severity === "MEDIUM" ? "warning" : "secondary"}>
                        {a.severity}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{a.action} · {a.entityType} · {new Date(a.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
