// Creates one login user per role: <role>@hospital.com / <role>@123.
// Skips roles whose email already exists. Idempotent — safe to re-run.
// Run from server dir: npx tsx prisma/seed-role-users.ts
import "dotenv/config";
import { Pool } from "pg";
import { randomBytes, scrypt } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const ROLES = [
  "SUPER_ADMIN",
  "HOSPITAL_ADMIN",
  "RECEPTIONIST",
  "DOCTOR",
  "NURSE",
  "LAB_TECHNICIAN",
  "PATHOLOGIST",
  "PHARMACIST",
  "BILLING_STAFF",
  "INVENTORY_MANAGER",
  "AMBULANCE_DISPATCHER",
  "AMBULANCE_DRIVER",
  "WARD_BOY",
  "ACCOUNTANT",
  "IT_SUPPORT",
  "PATIENT",
] as const;

/**
 * Hash a password exactly like Better Auth v1.x (`@better-auth/utils/password`):
 * node:crypto scrypt, N=16384/r=16/p=1/dkLen=64, 16-byte hex salt, `<salt>:<hex>`.
 */
function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16).toString("hex");
    scrypt(
      password.normalize("NFKC"),
      salt,
      64,
      { N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 },
      (err, key) => {
        if (err) reject(err);
        else resolve(`${salt}:${key.toString("hex")}`);
      },
    );
  });
}

async function main() {
  const created: { role: string; email: string; password: string }[] = [];
  const skipped: { role: string; email: string }[] = [];

  for (const role of ROLES) {
    const slug = role.toLowerCase();
    const email = `${slug}@hospital.com`;
    const password = `${slug}@123`;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      skipped.push({ role, email });
      console.log(`⏭️  ${role} already exists (${email}) — skipping`);
      continue;
    }

    const user = await prisma.user.create({
      data: { name: role, email, role },
    });
    const hash = await hashPassword(password);
    await prisma.account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: hash,
      },
    });

    created.push({ role, email, password });
    console.log(`✅ Created ${role}: ${email} / ${password}`);
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Created: ${created.length}, Skipped (already existed): ${skipped.length}`);
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:", error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
