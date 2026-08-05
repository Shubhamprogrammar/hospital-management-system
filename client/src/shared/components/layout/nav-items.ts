import {
  AmbulanceIcon,
  BarChart3Icon,
  BedDoubleIcon,
  BellIcon,
  BotIcon,
  Building2Icon,
  CalendarClockIcon,
  ClipboardListIcon,
  FileSearchIcon,
  FlaskConicalIcon,
  LayoutDashboardIcon,
  MessageSquareIcon,
  MessageSquareHeartIcon,
  PackageIcon,
  PillIcon,
  ReceiptIcon,
  SettingsIcon,
  ShieldAlertIcon,
  SparklesIcon,
  StethoscopeIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";

import { isAdminRole, ROLES, type Role } from "@/shared/types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * Strict role allowlist — only these roles see the item (SUPER_ADMIN and
   * HOSPITAL_ADMIN always see everything via canViewNavItem).
   * Omit = visible to every signed-in role. Empty array = admin-only.
   * NOTE: strict membership, NOT a hierarchy — a PHARMACIST must never see
   * billing-only modules just because both sit at the same level.
   */
  minRoles?: Role[];
  /**
   * When false, even system admins do not get the automatic visibility override.
   * Use for doctor-owned clinical workflows that must remain hidden from other roles.
   */
  allowAdminOverride?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Staff roles allowed to use Chat — mirrors the backend allow-list in
 * `server/src/modules/chat/chat.routes.ts` (FRD 25.3 — not exposed to PATIENT).
 */
export const STAFF_CHAT_ROLES: Role[] = [
  ROLES.SUPER_ADMIN,
  ROLES.HOSPITAL_ADMIN,
  ROLES.DOCTOR,
  ROLES.NURSE,
  ROLES.RECEPTIONIST,
  ROLES.LAB_TECHNICIAN,
  ROLES.PHARMACIST,
  ROLES.BILLING_STAFF,
  ROLES.INVENTORY_MANAGER,
  ROLES.AMBULANCE_DISPATCHER,
  ROLES.AMBULANCE_DRIVER,
  ROLES.WARD_BOY,
  ROLES.IT_SUPPORT,
];

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboardIcon },
      {
        label: "Notifications",
        href: "/notifications",
        icon: BellIcon,
      },
    ],
  },
  {
    label: "Patients & Scheduling",
    items: [
      {
        label: "Patients",
        href: "/patients",
        icon: UsersIcon,
        minRoles: [ROLES.RECEPTIONIST, ROLES.NURSE, ROLES.DOCTOR],
      },
      {
        label: "Appointments",
        href: "/appointments",
        icon: CalendarClockIcon,
        minRoles: [ROLES.RECEPTIONIST, ROLES.DOCTOR, ROLES.PATIENT],
      },
      {
        label: "OPD Queue",
        href: "/opd",
        icon: ClipboardListIcon,
        minRoles: [ROLES.RECEPTIONIST, ROLES.NURSE, ROLES.DOCTOR],
      },
    ],
  },
  {
    label: "Clinical",
    items: [
      {
        label: "Doctors",
        href: "/doctors",
        icon: StethoscopeIcon,
        minRoles: [],
      },
      {
        label: "Departments",
        href: "/departments",
        icon: Building2Icon,
        minRoles: [],
      },
      {
        label: "IPD Admissions",
        href: "/ipd",
        icon: BedDoubleIcon,
        minRoles: [ROLES.DOCTOR, ROLES.NURSE, ROLES.RECEPTIONIST],
      },
      {
        label: "Wards",
        href: "/wards",
        icon: Building2Icon,
        minRoles: [],
      },
      {
        label: "Beds",
        href: "/beds",
        icon: BedDoubleIcon,
        minRoles: [ROLES.NURSE, ROLES.WARD_BOY],
      },
      {
        label: "Prescriptions",
        href: "/prescriptions",
        icon: PillIcon,
        minRoles: [ROLES.DOCTOR, ROLES.PHARMACIST],
      },
      {
        label: "AI Prescriptions",
        href: "/ai-prescriptions",
        icon: SparklesIcon,
        minRoles: [ROLES.DOCTOR],
        allowAdminOverride: false,
      },
    ],
  },
  {
    label: "Diagnostics & Pharmacy",
    items: [
      {
        label: "Laboratory",
        href: "/laboratory",
        icon: FlaskConicalIcon,
        minRoles: [ROLES.DOCTOR, ROLES.LAB_TECHNICIAN, ROLES.PATHOLOGIST],
      },
      {
        label: "Pharmacy",
        href: "/pharmacy",
        icon: PillIcon,
        minRoles: [ROLES.PHARMACIST],
      },
      {
        label: "Inventory",
        href: "/inventory",
        icon: PackageIcon,
        minRoles: [ROLES.INVENTORY_MANAGER],
      },
    ],
  },
  {
    label: "Finance & Operations",
    items: [
      {
        label: "Billing",
        href: "/billing",
        icon: ReceiptIcon,
        minRoles: [ROLES.BILLING_STAFF, ROLES.ACCOUNTANT],
      },
      {
        label: "Payments",
        href: "/payments",
        icon: WalletIcon,
        minRoles: [ROLES.BILLING_STAFF, ROLES.ACCOUNTANT],
      },
      {
        label: "Ambulance",
        href: "/ambulance",
        icon: AmbulanceIcon,
        minRoles: [ROLES.AMBULANCE_DISPATCHER, ROLES.AMBULANCE_DRIVER, ROLES.RECEPTIONIST, ROLES.HOSPITAL_ADMIN],
      },
      {
        label: "Reports",
        href: "/reports",
        icon: BarChart3Icon,
        minRoles: [ROLES.DOCTOR, ROLES.BILLING_STAFF, ROLES.INVENTORY_MANAGER],
      },
    ],
  },
  {
    label: "Communication",
    items: [
      {
        label: "Chat",
        href: "/chat",
        icon: MessageSquareIcon,
        minRoles: STAFF_CHAT_ROLES,
      },
      {
        label: "Patient Chat",
        href: "/patient-chat",
        icon: MessageSquareHeartIcon,
        minRoles: [ROLES.PATIENT, ROLES.DOCTOR, ROLES.NURSE, ROLES.RECEPTIONIST, ROLES.HOSPITAL_ADMIN],
      },
      {
        label: "Hospital Assistant",
        href: "/chatbot",
        icon: BotIcon,
      },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Users", href: "/users", icon: UsersIcon, minRoles: [] },
      { label: "Roles", href: "/roles", icon: ShieldAlertIcon, minRoles: [] },
      { label: "Audit Logs", href: "/audit", icon: FileSearchIcon, minRoles: [] },
      { label: "Settings", href: "/settings", icon: SettingsIcon, minRoles: [] },
    ],
  },
];

/**
 * Role-based sidebar visibility.
 * - No `minRoles` → everyone sees it.
 * - System admins (SUPER_ADMIN / HOSPITAL_ADMIN) → see everything.
 * - Otherwise the role must be listed in `minRoles` explicitly (strict match).
 */
export function canViewNavItem(role: Role | undefined, item: NavItem): boolean {
  if (!item.minRoles) return true;
  if (item.allowAdminOverride !== false && isAdminRole(role)) return true;
  return !!role && item.minRoles.includes(role);
}

/** Flat list for simple consumers (e.g. tests, sitemaps). */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/** Every portal route — used by proxy.ts. */
export const PORTAL_ROUTES = NAV_ITEMS.map((item) => item.href);
