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
  // Neon's compute can autosuspend after inactivity; waking it can take
  // several seconds, so a tight budget caused "connection terminated due to
  // connection timeout" under cold starts. 20s covers a cold compute wake
  // while still failing fast against a genuinely unreachable DB.
  connectionTimeoutMillis: 20_000,
  // Keep idle connections around longer so bursts don't pay a full cold
  // TLS handshake (measured ~1.5s+) on every new connection.
  idleTimeoutMillis: 60_000,
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
