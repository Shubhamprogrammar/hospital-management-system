import {
  AmbulanceIcon,
  BarChart3Icon,
  BedDoubleIcon,
  Building2Icon,
  CalendarClockIcon,
  ClipboardListIcon,
  FileSearchIcon,
  FlaskConicalIcon,
  LayoutDashboardIcon,
  MessageSquareIcon,
  PackageIcon,
  PillIcon,
  ReceiptIcon,
  SettingsIcon,
  ShieldAlertIcon,
  StethoscopeIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";

import { ROLES, type Role } from "@/shared/types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Roles that meet-or-exceed any of these hierarchy levels can see this item. Omit = everyone. */
  minRoles?: Role[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboardIcon }],
  },
  {
    label: "Patients & Scheduling",
    items: [
      {
        label: "Patients",
        href: "/patients",
        icon: UsersIcon,
        minRoles: [ROLES.RECEPTIONIST, ROLES.NURSE, ROLES.DOCTOR, ROLES.WARD_BOY, ROLES.HOSPITAL_ADMIN],
      },
      {
        label: "Appointments",
        href: "/appointments",
        icon: CalendarClockIcon,
        minRoles: [ROLES.RECEPTIONIST, ROLES.NURSE, ROLES.DOCTOR, ROLES.HOSPITAL_ADMIN],
      },
      {
        label: "OPD Queue",
        href: "/opd",
        icon: ClipboardListIcon,
        minRoles: [ROLES.RECEPTIONIST, ROLES.NURSE, ROLES.DOCTOR, ROLES.HOSPITAL_ADMIN],
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
        minRoles: [ROLES.RECEPTIONIST, ROLES.NURSE, ROLES.DOCTOR, ROLES.HOSPITAL_ADMIN],
      },
      {
        label: "Departments",
        href: "/departments",
        icon: Building2Icon,
        minRoles: [ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN],
      },
      {
        label: "IPD Admissions",
        href: "/ipd",
        icon: BedDoubleIcon,
        minRoles: [ROLES.DOCTOR, ROLES.NURSE, ROLES.RECEPTIONIST, ROLES.WARD_BOY, ROLES.HOSPITAL_ADMIN],
      },
      {
        label: "Wards",
        href: "/wards",
        icon: Building2Icon,
        minRoles: [ROLES.NURSE, ROLES.WARD_BOY, ROLES.HOSPITAL_ADMIN],
      },
      {
        label: "Beds",
        href: "/beds",
        icon: BedDoubleIcon,
        minRoles: [ROLES.NURSE, ROLES.WARD_BOY, ROLES.HOSPITAL_ADMIN],
      },
      {
        label: "Prescriptions",
        href: "/prescriptions",
        icon: PillIcon,
        minRoles: [ROLES.DOCTOR, ROLES.PHARMACIST, ROLES.HOSPITAL_ADMIN],
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
        minRoles: [ROLES.DOCTOR, ROLES.LAB_TECHNICIAN, ROLES.PATHOLOGIST, ROLES.HOSPITAL_ADMIN],
      },
      {
        label: "Pharmacy",
        href: "/pharmacy",
        icon: PillIcon,
        minRoles: [ROLES.PHARMACIST, ROLES.HOSPITAL_ADMIN],
      },
      {
        label: "Inventory",
        href: "/inventory",
        icon: PackageIcon,
        minRoles: [ROLES.INVENTORY_MANAGER, ROLES.HOSPITAL_ADMIN],
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
        minRoles: [ROLES.BILLING_STAFF, ROLES.ACCOUNTANT, ROLES.HOSPITAL_ADMIN],
      },
      {
        label: "Payments",
        href: "/payments",
        icon: WalletIcon,
        minRoles: [ROLES.BILLING_STAFF, ROLES.ACCOUNTANT, ROLES.HOSPITAL_ADMIN],
      },
      {
        label: "Ambulance",
        href: "/ambulance",
        icon: AmbulanceIcon,
        minRoles: [ROLES.AMBULANCE_DISPATCHER, ROLES.RECEPTIONIST, ROLES.HOSPITAL_ADMIN],
      },
      {
        label: "Reports",
        href: "/reports",
        icon: BarChart3Icon,
        minRoles: [ROLES.HOSPITAL_ADMIN, ROLES.BILLING_STAFF, ROLES.INVENTORY_MANAGER, ROLES.DOCTOR],
      },
    ],
  },
  {
    label: "Communication",
    items: [{ label: "Chat", href: "/chat", icon: MessageSquareIcon }],
  },
  {
    label: "Administration",
    items: [
      {
        label: "Users",
        href: "/users",
        icon: UsersIcon,
        minRoles: [ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN],
      },
      {
        label: "Roles",
        href: "/roles",
        icon: ShieldAlertIcon,
        minRoles: [ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN],
      },
      {
        label: "Audit Logs",
        href: "/audit",
        icon: FileSearchIcon,
        minRoles: [ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN],
      },
      {
        label: "Settings",
        href: "/settings",
        icon: SettingsIcon,
        minRoles: [ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN],
      },
    ],
  },
];

/** Flat list for simple consumers (e.g. tests, sitemaps). */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/** Every portal route — used by proxy.ts. */
export const PORTAL_ROUTES = NAV_ITEMS.map((item) => item.href);
