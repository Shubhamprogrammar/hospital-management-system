import type { LucideIcon } from "lucide-react";
import {
  AmbulanceIcon,
  BedDoubleIcon,
  CalendarClockIcon,
  ClipboardListIcon,
  DollarSignIcon,
  FileTextIcon,
  FlaskConicalIcon,
  PackageIcon,
  PillIcon,
  UsersIcon,
} from "lucide-react";

import { ROLES, type Role } from "@/shared/types";

/** Scope of a stat card — maps to a query in useDashboardData. */
export type StatScope =
  | "patients"
  | "appointments"
  | "opdWaiting"
  | "bills"
  | "lowStock"
  | "labPending"
  | "pharmacyQueue"
  | "admissions"
  | "ambulanceRequests"
  | "prescriptions";

/** Presentational panel rendered on the dashboard. */
export type DashboardPanel =
  | "appointments"
  | "opdQueue"
  | "prescriptions"
  | "labOrders"
  | "pharmacyQueue"
  | "inventoryAlerts"
  | "bills"
  | "admissions"
  | "ambulanceRequests"
  | "chat";

export interface RoleStatDef {
  label: string;
  href: string;
  icon: LucideIcon;
  scope: StatScope;
}

export interface QuickActionDef {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface RoleDashboardConfig {
  /** Stable machine kind used for theming + tests. */
  kind: string;
  eyebrow: string;
  title: string;
  description: string;
  accent: string;
  stats: RoleStatDef[];
  quickActions: QuickActionDef[];
  panels: DashboardPanel[];
}

const patientsStat = { label: "Total Patients", href: "/patients", icon: UsersIcon, scope: "patients" as const };
const appointmentsStat = { label: "Appointments", href: "/appointments", icon: CalendarClockIcon, scope: "appointments" as const };
const opdWaitingStat = { label: "OPD Waiting", href: "/opd", icon: ClipboardListIcon, scope: "opdWaiting" as const };
const billsStat = { label: "Open Bills", href: "/billing", icon: DollarSignIcon, scope: "bills" as const };
const lowStockStat = { label: "Low Stock", href: "/inventory", icon: PackageIcon, scope: "lowStock" as const };
const labPendingStat = { label: "Pending Orders", href: "/laboratory", icon: FlaskConicalIcon, scope: "labPending" as const };
const pharmacyQueueStat = { label: "Pharmacy Queue", href: "/pharmacy", icon: PillIcon, scope: "pharmacyQueue" as const };
const admissionsStat = { label: "IPD Admissions", href: "/ipd", icon: BedDoubleIcon, scope: "admissions" as const };
const ambulanceStat = { label: "Ambulance Requests", href: "/ambulance", icon: AmbulanceIcon, scope: "ambulanceRequests" as const };
const prescriptionsStat = { label: "Prescriptions", href: "/prescriptions", icon: FileTextIcon, scope: "prescriptions" as const };

const ACCENTS = {
  indigo: "from-sky-600 via-blue-600 to-cyan-400",
  teal: "from-teal-600 via-cyan-600 to-sky-400",
  rose: "from-rose-500 via-red-500 to-amber-400",
  amber: "from-amber-500 via-orange-500 to-rose-400",
  sky: "from-blue-600 via-sky-500 to-cyan-400",
  emerald: "from-emerald-600 via-teal-600 to-cyan-400",
  violet: "from-blue-700 via-indigo-600 to-cyan-500",
} as const;

const dashboards: Record<string, RoleDashboardConfig> = {
  overview: {
    kind: "overview",
    eyebrow: "Hospital overview",
    title: "Command center",
    description: "Live activity across every department — patients, queues, billing, and care coordination.",
    accent: ACCENTS.indigo,
    stats: [patientsStat, appointmentsStat, opdWaitingStat, billsStat],
    quickActions: [
      { label: "New Patient", href: "/patients", icon: UsersIcon },
      { label: "Book Visit", href: "/appointments", icon: CalendarClockIcon },
      { label: "OPD Queue", href: "/opd", icon: ClipboardListIcon },
      { label: "Create Bill", href: "/billing", icon: DollarSignIcon },
    ],
    panels: ["appointments", "opdQueue", "inventoryAlerts", "chat"],
  },
  frontdesk: {
    kind: "frontdesk",
    eyebrow: "Front desk",
    title: "Welcome station",
    description: "Register patients, manage today's appointments, and keep the OPD queue moving.",
    accent: ACCENTS.sky,
    stats: [appointmentsStat, opdWaitingStat, patientsStat, ambulanceStat],
    quickActions: [
      { label: "Register Patient", href: "/patients", icon: UsersIcon },
      { label: "Book Appointment", href: "/appointments", icon: CalendarClockIcon },
      { label: "OPD Queue", href: "/opd", icon: ClipboardListIcon },
      { label: "Raise Request", href: "/ambulance", icon: AmbulanceIcon },
    ],
    panels: ["opdQueue", "appointments", "ambulanceRequests"],
  },
  clinical: {
    kind: "clinical",
    eyebrow: "Clinical workspace",
    title: "Today's clinic",
    description: "Your consultations, OPD queue, and prescriptions in one focused view.",
    accent: ACCENTS.teal,
    stats: [appointmentsStat, opdWaitingStat, prescriptionsStat, labPendingStat],
    quickActions: [
      { label: "Consult OPD", href: "/opd", icon: ClipboardListIcon },
      { label: "Prescribe", href: "/prescriptions", icon: PillIcon },
      { label: "Lab Orders", href: "/laboratory", icon: FlaskConicalIcon },
      { label: "IPD Admissions", href: "/ipd", icon: BedDoubleIcon },
    ],
    panels: ["opdQueue", "appointments", "prescriptions", "labOrders"],
  },
  nursing: {
    kind: "nursing",
    eyebrow: "Ward operations",
    title: "Wards & beds",
    description: "IPD admissions, bed availability, and today's ward activity.",
    accent: ACCENTS.emerald,
    stats: [admissionsStat, appointmentsStat, opdWaitingStat, billsStat],
    quickActions: [
      { label: "IPD Admissions", href: "/ipd", icon: BedDoubleIcon },
      { label: "Wards", href: "/wards", icon: BedDoubleIcon },
      { label: "Beds", href: "/beds", icon: BedDoubleIcon },
      { label: "OPD Queue", href: "/opd", icon: ClipboardListIcon },
    ],
    panels: ["admissions", "opdQueue", "appointments"],
  },
  ward: {
    kind: "ward",
    eyebrow: "Ward services",
    title: "Wards & beds",
    description: "Bed availability, IPD admissions, and your assigned ward activity.",
    accent: ACCENTS.emerald,
    stats: [admissionsStat, appointmentsStat, opdWaitingStat],
    quickActions: [
      { label: "Wards", href: "/wards", icon: BedDoubleIcon },
      { label: "Beds", href: "/beds", icon: BedDoubleIcon },
      { label: "IPD Admissions", href: "/ipd", icon: BedDoubleIcon },
      { label: "OPD Queue", href: "/opd", icon: ClipboardListIcon },
    ],
    panels: ["admissions", "opdQueue", "appointments"],
  },
  lab: {
    kind: "lab",
    eyebrow: "Diagnostics",
    title: "Laboratory desk",
    description: "Pending orders, samples to collect, and results to verify.",
    accent: ACCENTS.violet,
    stats: [labPendingStat, patientsStat, appointmentsStat],
    quickActions: [
      { label: "Lab Orders", href: "/laboratory", icon: FlaskConicalIcon },
      { label: "Patients", href: "/patients", icon: UsersIcon },
    ],
    panels: ["labOrders"],
  },
  pharmacy: {
    kind: "pharmacy",
    eyebrow: "Pharmacy",
    title: "Dispensing desk",
    description: "Prescriptions waiting to be dispensed and stock that needs attention.",
    accent: ACCENTS.rose,
    stats: [pharmacyQueueStat, prescriptionsStat, lowStockStat],
    quickActions: [
      { label: "Pharmacy Queue", href: "/pharmacy", icon: PillIcon },
      { label: "Inventory", href: "/inventory", icon: PackageIcon },
      { label: "Prescriptions", href: "/prescriptions", icon: FileTextIcon },
    ],
    panels: ["pharmacyQueue", "inventoryAlerts"],
  },
  finance: {
    kind: "finance",
    eyebrow: "Finance",
    title: "Billing & payments",
    description: "Open bills, discounts awaiting approval, and payment activity.",
    accent: ACCENTS.amber,
    stats: [billsStat, patientsStat, appointmentsStat],
    quickActions: [
      { label: "Create Bill", href: "/billing", icon: DollarSignIcon },
      { label: "Payments", href: "/payments", icon: DollarSignIcon },
      { label: "Reports", href: "/reports", icon: FileTextIcon },
    ],
    panels: ["bills", "appointments"],
  },
  inventory: {
    kind: "inventory",
    eyebrow: "Supply chain",
    title: "Inventory & stock",
    description: "Low-stock alerts, stock levels, and purchase orders.",
    accent: ACCENTS.emerald,
    stats: [lowStockStat, patientsStat, billsStat],
    quickActions: [
      { label: "Inventory", href: "/inventory", icon: PackageIcon },
      { label: "Purchase Orders", href: "/inventory", icon: PackageIcon },
    ],
    panels: ["inventoryAlerts", "bills"],
  },
  dispatch: {
    kind: "dispatch",
    eyebrow: "Dispatch",
    title: "Ambulance control",
    description: "Requests to assign, vehicles on the road, and live trips.",
    accent: ACCENTS.rose,
    stats: [ambulanceStat, appointmentsStat, patientsStat],
    quickActions: [
      { label: "Ambulance", href: "/ambulance", icon: AmbulanceIcon },
      { label: "OPD Queue", href: "/opd", icon: ClipboardListIcon },
    ],
    panels: ["ambulanceRequests", "opdQueue"],
  },
  driver: {
    kind: "driver",
    eyebrow: "Fleet",
    title: "Your trips",
    description: "Assigned trips and dispatch requests waiting for a vehicle.",
    accent: ACCENTS.sky,
    stats: [ambulanceStat],
    quickActions: [{ label: "Ambulance", href: "/ambulance", icon: AmbulanceIcon }],
    panels: ["ambulanceRequests"],
  },
  support: {
    kind: "support",
    eyebrow: "IT support",
    title: "System health",
    description: "Audit trail, users, and configuration across the platform.",
    accent: ACCENTS.violet,
    stats: [patientsStat, appointmentsStat, billsStat],
    quickActions: [
      { label: "Audit Logs", href: "/audit", icon: FileTextIcon },
      { label: "Users", href: "/users", icon: UsersIcon },
      { label: "Settings", href: "/settings", icon: FileTextIcon },
    ],
    panels: ["appointments", "chat"],
  },
  patient: {
    kind: "patient",
    eyebrow: "Patient portal",
    title: "My care",
    description: "Your appointments, prescriptions, and bills at a glance.",
    accent: ACCENTS.teal,
    stats: [appointmentsStat, prescriptionsStat, billsStat],
    quickActions: [
      { label: "Book Visit", href: "/appointments", icon: CalendarClockIcon },
      { label: "My Bills", href: "/billing", icon: DollarSignIcon },
    ],
    panels: ["appointments", "prescriptions", "bills"],
  },
};

/**
 * Role → dashboard mapping (FRD §3.9 Global User Roles).
 * Every role lands on their own dashboard via /dashboard.
 */
export const ROLE_DASHBOARD: Record<Role, RoleDashboardConfig> = {
  [ROLES.SUPER_ADMIN]: dashboards.overview,
  [ROLES.HOSPITAL_ADMIN]: dashboards.overview,
  [ROLES.RECEPTIONIST]: dashboards.frontdesk,
  [ROLES.DOCTOR]: dashboards.clinical,
  [ROLES.PATHOLOGIST]: dashboards.clinical,
  [ROLES.NURSE]: dashboards.nursing,
  [ROLES.LAB_TECHNICIAN]: dashboards.lab,
  [ROLES.PHARMACIST]: dashboards.pharmacy,
  [ROLES.BILLING_STAFF]: dashboards.finance,
  [ROLES.ACCOUNTANT]: dashboards.finance,
  [ROLES.INVENTORY_MANAGER]: dashboards.inventory,
  [ROLES.AMBULANCE_DISPATCHER]: dashboards.dispatch,
  [ROLES.AMBULANCE_DRIVER]: dashboards.driver,
  [ROLES.WARD_BOY]: dashboards.ward,
  [ROLES.IT_SUPPORT]: dashboards.support,
  [ROLES.PATIENT]: dashboards.patient,
};

