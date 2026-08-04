"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { PillIcon } from "lucide-react";

import { PageHeader } from "@/shared/components/layout/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Card, CardContent } from "@/shared/components/ui/card";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import { StatusBadge } from "@/shared/components/feedback/StatusBadge";
import { getPharmacyQueue } from "@/shared/services/pharmacy.service";
import { useSession } from "@/shared/lib/auth-client";
import { hasAnyRole, ROLES, type Role } from "@/shared/types";

export default function PharmacyPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const role = session?.user?.role as Role | undefined;
  // Backend pharmacy endpoints authorize SUPER_ADMIN + PHARMACIST only — a
  // DOCTOR must not see dispense actions.
  const isPharmacist = hasAnyRole(role, ROLES.PHARMACIST, ROLES.SUPER_ADMIN);

  const queue = useQuery({ queryKey: ["pharmacy", "queue"], queryFn: () => getPharmacyQueue({}) });

  // Dispense flow is a two-step (queue → dispense) — surfaced here with createDispense.
  const dispatch = useMutation({
    mutationFn: async (prescriptionId: string) => {
      const { createDispense } = await import("@/shared/services/pharmacy.service");
      return createDispense({ prescriptionId, items: [] });
    },
    onSuccess: () => {
      toast.success("Dispense created");
      queryClient.invalidateQueries({ queryKey: ["pharmacy"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader title="Pharmacy" description="Dispensing queue and prescription fulfillment." />

      {queue.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : queue.isError ? (
        <ErrorState error={queue.error} onRetry={() => queue.refetch()} />
      ) : queue.data?.length === 0 ? (
        <EmptyState icon={PillIcon} title="Dispensing queue is empty" description="Prescriptions awaiting dispensing appear here." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {queue.data?.map((entry) => (
            <Card key={entry.prescription.id}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{entry.prescription.patient?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      #{entry.position} · {entry.prescription.doctor?.name} · {new Date(entry.prescription.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <StatusBadge status={entry.prescription.status} />
                </div>
                <div className="mt-3 space-y-1.5">
                  {entry.prescription.items?.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-1.5 text-sm">
                      <span>{item.drug?.name ?? "Drug"}</span>
                      <span className="text-xs text-muted-foreground">
                        {item.dosage} · {item.frequency} · {item.durationDays}d
                      </span>
                    </div>
                  ))}
                </div>
                {isPharmacist && entry.prescription.status === "ACTIVE" && (
                  <Button size="sm" className="mt-4 w-full" onClick={() => dispatch.mutate(entry.prescription.id)} disabled={dispatch.isPending}>
                    Start dispense
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
