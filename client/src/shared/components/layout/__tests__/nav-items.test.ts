import { describe, expect, it } from "vitest";

import { canViewNavItem, NAV_GROUPS } from "@/shared/components/layout/nav-items";
import { ROLES, type Role } from "@/shared/types";

const ALL_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

function itemByHref(href: string) {
  const item = ALL_ITEMS.find((i) => i.href === href);
  if (!item) throw new Error(`No nav item for ${href}`);
  return item;
}

describe("canViewNavItem", () => {
  it("shows unrestricted items (Dashboard) to every role, even undefined", () => {
    const dashboard = itemByHref("/dashboard");
    expect(canViewNavItem(undefined, dashboard)).toBe(true);
    expect(canViewNavItem(ROLES.PATIENT, dashboard)).toBe(true);
    expect(canViewNavItem(ROLES.SUPER_ADMIN, dashboard)).toBe(true);
  });

  it("shows every module to system admins", () => {
    for (const item of ALL_ITEMS) {
      expect(canViewNavItem(ROLES.SUPER_ADMIN, item), item.href).toBe(true);
      expect(canViewNavItem(ROLES.HOSPITAL_ADMIN, item), item.href).toBe(true);
    }
  });

  it("keeps admin-only modules hidden from staff roles", () => {
    for (const role of [ROLES.DOCTOR, ROLES.PHARMACIST, ROLES.RECEPTIONIST, ROLES.PATIENT] as Role[]) {
      for (const href of ["/wards", "/departments", "/users", "/roles", "/audit", "/settings"]) {
        expect(canViewNavItem(role, itemByHref(href)), `${role} / ${href}`).toBe(false);
      }
    }
  });

  it("doctor sees clinical modules but not finance/pharmacy-only ones", () => {
    const doctor = ROLES.DOCTOR;
    for (const href of ["/patients", "/opd", "/doctors", "/ipd", "/prescriptions", "/laboratory", "/reports", "/chat"]) {
      expect(canViewNavItem(doctor, itemByHref(href)), href).toBe(true);
    }
    for (const href of ["/appointments", "/pharmacy", "/inventory", "/billing", "/payments", "/beds"]) {
      expect(canViewNavItem(doctor, itemByHref(href)), href).toBe(false);
    }
  });

  it("pharmacist sees pharmacy + prescriptions but not lab/billing", () => {
    const pharmacist = ROLES.PHARMACIST;
    expect(canViewNavItem(pharmacist, itemByHref("/pharmacy"))).toBe(true);
    expect(canViewNavItem(pharmacist, itemByHref("/prescriptions"))).toBe(true);
    expect(canViewNavItem(pharmacist, itemByHref("/laboratory"))).toBe(false);
    expect(canViewNavItem(pharmacist, itemByHref("/billing"))).toBe(false);
  });

  it("receptionist sees scheduling modules but not clinical prescriptions", () => {
    const receptionist = ROLES.RECEPTIONIST;
    for (const href of ["/patients", "/appointments", "/opd", "/ambulance", "/ipd"]) {
      expect(canViewNavItem(receptionist, itemByHref(href)), href).toBe(true);
    }
    expect(canViewNavItem(receptionist, itemByHref("/prescriptions"))).toBe(false);
    expect(canViewNavItem(receptionist, itemByHref("/billing"))).toBe(false);
  });

  it("nurse/ward boy see beds, nurse sees OPD/IPD but not prescriptions", () => {
    expect(canViewNavItem(ROLES.NURSE, itemByHref("/beds"))).toBe(true);
    expect(canViewNavItem(ROLES.WARD_BOY, itemByHref("/beds"))).toBe(true);
    expect(canViewNavItem(ROLES.NURSE, itemByHref("/opd"))).toBe(true);
    expect(canViewNavItem(ROLES.NURSE, itemByHref("/ipd"))).toBe(true);
    expect(canViewNavItem(ROLES.NURSE, itemByHref("/prescriptions"))).toBe(false);
  });

  it("patient only sees unrestricted items", () => {
    const patient = ROLES.PATIENT;
    expect(canViewNavItem(patient, itemByHref("/dashboard"))).toBe(true);
    for (const href of ["/patients", "/chat", "/appointments", "/prescriptions"]) {
      expect(canViewNavItem(patient, itemByHref(href)), href).toBe(false);
    }
  });
});
