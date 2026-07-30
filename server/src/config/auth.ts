import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { admin, createAccessControl } from "better-auth/plugins";
import { prisma } from "./prisma.js";
import { env } from "./env.js";

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
  PHARMACIST: "PHARMACIST",
  ACCOUNTANT: "ACCOUNTANT",
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
  NURSE: 50,
  LAB_TECHNICIAN: 40,
  PHARMACIST: 40,
  ACCOUNTANT: 40,
  RECEPTIONIST: 30,
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

  // Trusted origins for CORS
  trustedOrigins: [env.CLIENT_URL],

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
