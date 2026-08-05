import "dotenv/config";
import { Pool } from "pg";
import { randomBytes, scrypt } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * Hash a password exactly like Better Auth v1.x (`@better-auth/utils/password`):
 * node:crypto scrypt, N=16384/r=16/p=1/dkLen=64, 16-byte hex salt, `<salt>:<hex>`.
 * Using any other scheme (e.g. bcrypt) would fail the sign-in verification.
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

/**
 * Backfill a credential account (email + password) for users created directly
 * via Prisma (e.g. the old /users creation path), which skipped Better Auth and
 * therefore left them unable to sign in ("Credential account not found").
 *
 * Usage:
 *   npx tsx prisma/set-user-password.ts                       # all users without a credential account
 *   npx tsx prisma/set-user-password.ts --email a@b.c         # a single user by email
 *   npx tsx prisma/set-user-password.ts --role RECEPTIONIST   # filter by role
 *   npx tsx prisma/set-user-password.ts --password "Secret@1" # explicit password
 *
 * The hash is produced with Better Auth's own scrypt hasher so sign-in works.
 */
async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const email = getArg("--email");
  const role = getArg("--role");
  const password = getArg("--password") ?? Math.random().toString(36).slice(-10) + "Aa1!";

  const where: Record<string, unknown> = {
    accounts: {
      none: { providerId: "credential" },
    },
  };
  if (email) where.email = email;
  if (role) where.role = role;

  const users = await prisma.user.findMany({
    where,
    select: { id: true, name: true, email: true, role: true },
  });

  if (users.length === 0) {
    console.log("No users without a credential account were found.");
    return;
  }

  const hash = await hashPassword(password);
  let updated = 0;

  for (const user of users) {
    await prisma.account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: hash,
      },
    });
    updated++;
    console.log(`✅ ${user.email} (${user.role}) — credential account created`);
  }

  console.log(`\n${updated} user(s) updated.`);
  console.log(`   Email:    ${email ?? "(see list above)"}`);
  console.log(`   Password: ${password}`);
  console.log(`   NOTE:     Existing sessions stay valid; sign-in now works.`);
}

main()
  .catch((error) => {
    console.error("❌ Script failed:", error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
