"use client";

import { useQuery } from "@tanstack/react-query";

import { listAppointments, getOpdQueue } from "@/shared/services/appointments.service";
import { searchPatients } from "@/shared/services/patients.service";
import { listBills } from "@/shared/services/billing.service";
import { getInventoryAlerts, getPharmacyQueue } from "@/shared/services/pharmacy.service";
import { listDepartments } from "@/shared/services/org.service";
import { listPrescriptions, listLabOrders } from "@/shared/services/clinical.service";
import { listAdmissions } from "@/shared/services/ipd.service";
import { listRequests } from "@/shared/services/ambulance.service";
import { toLocalDate } from "@/shared/lib/utils";
import type { RoleDashboardConfig, StatScope } from "@/modules/dashboard/constant/dashboards";

export interface DashboardStat {
  value?: number;
  loading: boolean;
  error: boolean;
}

/**
 * Fetch only the stat queries the role dashboard actually needs.
 * Each scope is gated by `enabled` so receptionists don't trigger
 * inventory/admissions calls, etc.
 */
export function useDashboardStats(config: RoleDashboardConfig) {
  const scopes = new Set<StatScope>(config.stats.map((s) => s.scope));

  const departments = useQuery({
    queryKey: ["dashboard", "stats", "departments"],
    queryFn: () => listDepartments({ limit: 1, isActive: true }),
    enabled: scopes.has("opdWaiting"),
    retry: 1,
  });
  const departmentId = departments.data?.items[0]?.id;

  const patients = useQuery({
    queryKey: ["dashboard", "stats", "patients"],
    queryFn: () => searchPatients({ limit: 1 }),
    enabled: scopes.has("patients"),
    retry: 1,
  });
  const appointments = useQuery({
    queryKey: ["dashboard", "stats", "appointments"],
    queryFn: () => listAppointments({ limit: 1 }),
    enabled: scopes.has("appointments"),
    retry: 1,
  });
  const queue = useQuery({
    queryKey: ["dashboard", "stats", "queue", departmentId],
    queryFn: () => getOpdQueue({ departmentId, date: toLocalDate(new Date()) }),
    enabled: scopes.has("opdWaiting") && !!departmentId,
    retry: 1,
  });
  const bills = useQuery({
    queryKey: ["dashboard", "stats", "bills"],
    queryFn: () => listBills({ limit: 1 }),
    enabled: scopes.has("bills"),
    retry: 1,
  });
  const alerts = useQuery({
    queryKey: ["dashboard", "stats", "alerts"],
    queryFn: () => getInventoryAlerts(),
    enabled: scopes.has("lowStock"),
    retry: 1,
  });
  const labOrders = useQuery({
    queryKey: ["dashboard", "stats", "labOrders"],
    queryFn: () => listLabOrders({ limit: 1 }),
    enabled: scopes.has("labPending"),
    retry: 1,
  });
  const pharmacyQueue = useQuery({
    queryKey: ["dashboard", "stats", "pharmacyQueue"],
    queryFn: () => getPharmacyQueue(),
    enabled: scopes.has("pharmacyQueue"),
    retry: 1,
  });
  const admissions = useQuery({
    queryKey: ["dashboard", "stats", "admissions"],
    queryFn: () => listAdmissions({ limit: 1 }),
    enabled: scopes.has("admissions"),
    retry: 1,
  });
  const ambulanceRequests = useQuery({
    queryKey: ["dashboard", "stats", "ambulanceRequests"],
    queryFn: () => listRequests({ limit: 1 }),
    enabled: scopes.has("ambulanceRequests"),
    retry: 1,
  });
  const prescriptions = useQuery({
    queryKey: ["dashboard", "stats", "prescriptions"],
    queryFn: () => listPrescriptions({ limit: 1 }),
    enabled: scopes.has("prescriptions"),
    retry: 1,
  });

  const map: Record<StatScope, DashboardStat> = {
    patients: { value: patients.data?.pagination.totalItems, loading: patients.isLoading, error: patients.isError },
    appointments: { value: appointments.data?.pagination.totalItems, loading: appointments.isLoading, error: appointments.isError },
    opdWaiting: { value: queue.data?.length, loading: queue.isLoading, error: queue.isError },
    bills: { value: bills.data?.pagination.totalItems, loading: bills.isLoading, error: bills.isError },
    lowStock: { value: alerts.data?.lowStock.length, loading: alerts.isLoading, error: alerts.isError },
    labPending: { value: labOrders.data?.pagination.totalItems, loading: labOrders.isLoading, error: labOrders.isError },
    pharmacyQueue: { value: pharmacyQueue.data?.length, loading: pharmacyQueue.isLoading, error: pharmacyQueue.isError },
    admissions: { value: admissions.data?.pagination.totalItems, loading: admissions.isLoading, error: admissions.isError },
    ambulanceRequests: { value: ambulanceRequests.data?.pagination.totalItems, loading: ambulanceRequests.isLoading, error: ambulanceRequests.isError },
    prescriptions: { value: prescriptions.data?.pagination.totalItems, loading: prescriptions.isLoading, error: prescriptions.isError },
  };

  return map;
}
