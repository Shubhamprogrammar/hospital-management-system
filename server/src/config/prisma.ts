import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { env } from "./env.js";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  // Bounded pool so a traffic spike can't exhaust Postgres connections.
  max: 10,
  // Fail fast when the pool is saturated or the DB is unreachable, instead of
  // letting requests (including the session check) queue behind slow queries.
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
  // Slow queries abort instead of starving the pool / session validation.
  statement_timeout: 10_000,
  query_timeout: 15_000,
});
const adapter = new PrismaPg(pool);

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { prisma };
