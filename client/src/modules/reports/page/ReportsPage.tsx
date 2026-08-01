"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { BarChart3Icon } from "lucide-react";

import { PageHeader } from "@/shared/components/layout/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/shared/components/ui/table";
import { Badge } from "@/shared/components/ui/badge";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import { generateReport, listReportTemplates } from "@/shared/services/reports.service";

export default function ReportsPage() {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState<string | null>(null);

  const templates = useQuery({ queryKey: ["reports", "templates"], queryFn: () => listReportTemplates({ limit: 50 }) });

  const generate = useMutation({
    mutationFn: (templateId: string) => generateReport({ templateId }),
    onSuccess: (job) => {
      toast.success(`Report queued (${job.status})`);
      setRunning(null);
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setRunning(null);
    },
  });

  return (
    <div>
      <PageHeader title="Reports" description="Generate and download operational reports." />

      <div className="rounded-lg border border-border bg-card">
        {templates.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
          </div>
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
    </div>
  );
}
