"use client";

import { useMemo } from "react";

import { useSession } from "@/shared/lib/auth-client";
import { ROLES, type Role } from "@/shared/types";
import { ROLE_DASHBOARD, type RoleDashboardConfig } from "@/modules/dashboard/constant/dashboards";

export interface UseRoleDashboardResult {
  role?: Role;
  config: RoleDashboardConfig;
}

/** Resolve the FRD role → dashboard config for the signed-in user. */
export function useRoleDashboard(): UseRoleDashboardResult {
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;

  const config = useMemo(() => {
    const fallback = role && ROLE_DASHBOARD[role] ? ROLE_DASHBOARD[role] : ROLE_DASHBOARD[ROLES.HOSPITAL_ADMIN];
    return fallback;
  }, [role]);

  return {
    role,
    config,
  };
}
