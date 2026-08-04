import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { admin, createAccessControl } from "better-auth/plugins";
import { prisma } from "./prisma.js";
import { env } from "./env.js";
import { ensurePatientProfile } from "../core/utils/patientProfile.js";

/**
 * Hospital Management System roles.
 * Uses Better Auth's Admin plugin for role-based access control.
 */
export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  HOSPITAL_ADMIN: "HOSPITAL_ADMIN",
  RECEPTIONIST: "RECEPTIONIST",
  DOCTOR: "DOCTOR",
  NURSE: "NURSE",
  LAB_TECHNICIAN: "LAB_TECHNICIAN",
  PATHOLOGIST: "PATHOLOGIST",
  PHARMACIST: "PHARMACIST",
  BILLING_STAFF: "BILLING_STAFF",
  INVENTORY_MANAGER: "INVENTORY_MANAGER",
  AMBULANCE_DISPATCHER: "AMBULANCE_DISPATCHER",
  AMBULANCE_DRIVER: "AMBULANCE_DRIVER",
  WARD_BOY: "WARD_BOY",
  ACCOUNTANT: "ACCOUNTANT",
  IT_SUPPORT: "IT_SUPPORT",
  PATIENT: "PATIENT",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/**
 * Role hierarchy for permission checking.
 * Higher index = more privileged.
 */
export const ROLE_HIERARCHY: Record<Role, number> = {
  SUPER_ADMIN: 100,
  HOSPITAL_ADMIN: 80,
  DOCTOR: 60,
  PATHOLOGIST: 55,
  NURSE: 50,
  LAB_TECHNICIAN: 40,
  PHARMACIST: 40,
  BILLING_STAFF: 40,
  INVENTORY_MANAGER: 40,
  AMBULANCE_DISPATCHER: 35,
  ACCOUNTANT: 40,
  IT_SUPPORT: 30,
  RECEPTIONIST: 30,
  AMBULANCE_DRIVER: 25,
  WARD_BOY: 30,
  PATIENT: 10,
};

/**
 * Define all possible resource-action statements for the hospital system.
 * Each resource lists all possible actions that can be performed on it.
 * Roles then use subsets of these actions.
 */
const ALL_ACTIONS = ["create", "read", "update", "delete", "manage", "list", "set-role"] as const;
type Action = (typeof ALL_ACTIONS)[number];

const RESOURCES = {
  hospital: ALL_ACTIONS,
  user: ALL_ACTIONS,
  patients: ALL_ACTIONS,
  appointments: ALL_ACTIONS,
  prescriptions: ALL_ACTIONS,
  "lab-tests": ALL_ACTIONS,
  "lab-reports": ALL_ACTIONS,
  medications: ALL_ACTIONS,
  inventory: ALL_ACTIONS,
  vitals: ALL_ACTIONS,
  billing: ALL_ACTIONS,
  invoices: ALL_ACTIONS,
  payments: ALL_ACTIONS,
  profile: ALL_ACTIONS,
  "medical-records": ALL_ACTIONS,
  registration: ALL_ACTIONS,
} as const;

const ac = createAccessControl(RESOURCES);

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  // Base path matches our Express mount point
  basePath: "/api/v1/auth",

  // Trusted origins for CORS/CSRF (must match the Express CORS list in app.ts)
  trustedOrigins: env.clientUrls,

  // Email/password authentication
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    requireEmailVerification: false,
  },

  // Session management
  session: {
    expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
    updateAge: 24 * 60 * 60, // 1 day in seconds (refresh session)
    freshAge: 5 * 60, // 5 minutes (treat as fresh)
  },

  // Auto-provision a linked Patient profile when a patient account is created,
  // so self-registered patients don't have to re-enter details later.
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          if (user.role !== ROLES.PATIENT) return;
          try {
            await ensurePatientProfile(user as unknown as {
              id: string;
              name: string | null;
              email: string | null;
              phone: string | null;
              dateOfBirth: Date | null;
              gender: string | null;
            });
          } catch (error) {
            // Signup must not fail because profile provisioning did. The lazy
            // patient-chat resolver retries later once the account has data.
            console.error(`Failed to provision patient profile for user ${user.id}:`, error);
          }
        },
      },
    },
  },

  // User model configuration
  user: {
    modelName: "User",
    additionalFields: {
      phone: {
        type: "string",
        required: false,
      },
      dateOfBirth: {
        type: "date",
        required: false,
      },
      gender: {
        type: "string",
        required: false,
      },
      address: {
        type: "string",
        required: false,
      },
      bloodGroup: {
        type: "string",
        required: false,
      },
    },
  },

  // Rate limiting
  rateLimit: {
    window: 60, // 60 seconds
    max: 100, // max requests per window
  },

  // Admin plugin for role-based access control
  plugins: [
    admin({
      ac,
      defaultRole: ROLES.PATIENT,
      adminRoles: [ROLES.SUPER_ADMIN, ROLES.HOSPITAL_ADMIN],
      roles: {
        [ROLES.SUPER_ADMIN]: ac.newRole({
          hospital: ["manage"],
          user: ["create", "read", "update", "delete", "list", "set-role"],
          patients: ["create", "read", "update"],
          appointments: ["create", "read", "update", "delete"],
          prescriptions: ["create", "read", "update", "delete"],
          "lab-tests": ["create", "read", "update", "delete"],
          "lab-reports": ["create", "read", "update"],
          medications: ["create", "read", "update"],
          inventory: ["read", "update"],
          vitals: ["create", "read", "update"],
          billing: ["create", "read", "update"],
          invoices: ["create", "read", "update"],
          payments: ["create", "read"],
          profile: ["create", "read", "update", "delete"],
          "medical-records": ["create", "read", "update", "delete"],
          registration: ["create", "read", "update", "delete"],
        }),
        [ROLES.HOSPITAL_ADMIN]: ac.newRole({
          hospital: ["manage"],
          user: ["create", "read", "update", "list", "set-role"],
          appointments: ["create", "read", "update", "delete"],
          patients: ["read"],
          billing: ["read", "update"],
          invoices: ["read"],
          payments: ["read"],
          profile: ["read", "update"],
          registration: ["create", "read"],
        }),
        [ROLES.DOCTOR]: ac.newRole({
          patients: ["create", "read", "update"],
          appointments: ["create", "read", "update"],
          prescriptions: ["create", "read", "update", "delete"],
          "lab-reports": ["create", "read", "update"],
          "lab-tests": ["read"],
          vitals: ["read"],
          "medical-records": ["create", "read", "update"],
          profile: ["read", "update"],
        }),
        [ROLES.NURSE]: ac.newRole({
          patients: ["read", "update"],
          appointments: ["read", "update"],
          vitals: ["create", "read", "update"],
          "medical-records": ["read"],
          profile: ["read", "update"],
        }),
        [ROLES.LAB_TECHNICIAN]: ac.newRole({
          "lab-tests": ["create", "read", "update"],
          "lab-reports": ["create", "read", "update"],
          patients: ["read"],
          profile: ["read", "update"],
        }),
        [ROLES.PHARMACIST]: ac.newRole({
          prescriptions: ["read"],
          medications: ["create", "read", "update"],
          inventory: ["read", "update"],
          profile: ["read", "update"],
        }),
        [ROLES.ACCOUNTANT]: ac.newRole({
          billing: ["create", "read", "update"],
          invoices: ["create", "read", "update"],
          payments: ["create", "read"],
          profile: ["read", "update"],
        }),
        [ROLES.PATHOLOGIST]: ac.newRole({
          "lab-tests": ["read", "update"],
          "lab-reports": ["create", "read", "update"],
          "medical-records": ["read"],
          patients: ["read"],
          profile: ["read", "update"],
        }),
        [ROLES.BILLING_STAFF]: ac.newRole({
          billing: ["create", "read", "update"],
          invoices: ["create", "read", "update"],
          payments: ["create", "read"],
          profile: ["read", "update"],
        }),
        [ROLES.INVENTORY_MANAGER]: ac.newRole({
          medications: ["create", "read", "update"],
          inventory: ["create", "read", "update"],
          profile: ["read", "update"],
        }),
        [ROLES.AMBULANCE_DISPATCHER]: ac.newRole({
          patients: ["read"],
          profile: ["read", "update"],
        }),
        [ROLES.AMBULANCE_DRIVER]: ac.newRole({
          patients: ["read"],
          profile: ["read", "update"],
        }),
        [ROLES.WARD_BOY]: ac.newRole({
          patients: ["read"],
          appointments: ["read"],
          vitals: ["read"],
          profile: ["read", "update"],
        }),
        [ROLES.IT_SUPPORT]: ac.newRole({
          user: ["read"],
          profile: ["read", "update"],
        }),
        [ROLES.RECEPTIONIST]: ac.newRole({
          appointments: ["create", "read", "update"],
          patients: ["create", "read"],
          registration: ["create", "read"],
          profile: ["read", "update"],
        }),
        [ROLES.PATIENT]: ac.newRole({
          profile: ["read", "update"],
          appointments: ["create", "read"],
          "medical-records": ["read"],
        }),
      },
    }),
  ],
});

export type Auth = typeof auth;
