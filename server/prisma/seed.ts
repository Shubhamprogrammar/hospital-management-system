import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const SUPER_ADMIN_EMAIL = "admin@hospital.com";
const SUPER_ADMIN_PASSWORD = "Admin@123";
const SUPER_ADMIN_NAME = "System Admin";
const SERVER_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:8080";

async function main() {
  console.log("🌱 Seeding SUPER_ADMIN user...");

  // Check if SUPER_ADMIN already exists
  const existingAdmin = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
  });

  if (existingAdmin) {
    console.log(`✅ SUPER_ADMIN already exists: ${existingAdmin.email}`);
    return;
  }

  // Check if user already exists with the email (as a different role)
  const existingUser = await prisma.user.findUnique({
    where: { email: SUPER_ADMIN_EMAIL },
  });

  if (existingUser) {
    // Just update their role to SUPER_ADMIN
    await prisma.user.update({
      where: { email: SUPER_ADMIN_EMAIL },
      data: { role: "SUPER_ADMIN" },
    });
    console.log(`✅ Updated ${SUPER_ADMIN_EMAIL} role to SUPER_ADMIN`);
    return;
  }

  // Step 1: Create the user via the sign-up API (proper password hashing)
  console.log(`📝 Creating user via sign-up API...`);
  const response = await fetch(`${SERVER_URL}/api/v1/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: SERVER_URL,
    },
    body: JSON.stringify({
      name: SUPER_ADMIN_NAME,
      email: SUPER_ADMIN_EMAIL,
      password: SUPER_ADMIN_PASSWORD,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `Sign-up failed (${response.status}): ${JSON.stringify(error)}`,
    );
  }

  const result = await response.json();
  const userId = result.user?.id;
  if (!userId) {
    throw new Error("Sign-up succeeded but no user ID returned");
  }

  // Step 2: Update role to SUPER_ADMIN via Prisma
  await prisma.user.update({
    where: { id: userId },
    data: { role: "SUPER_ADMIN" },
  });

  console.log(`✅ Created SUPER_ADMIN:`);
  console.log(`   Email:    ${SUPER_ADMIN_EMAIL}`);
  console.log(`   Password: ${SUPER_ADMIN_PASSWORD}`);
  console.log(`   Role:     SUPER_ADMIN`);
  console.log(`   ID:       ${userId}`);
  console.log("");
  console.log("🔑 You can now sign in with these credentials!");
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:", error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
