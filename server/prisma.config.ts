import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "src/db/prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  // CLI operations (db push / migrate) run DDL, which transaction-pooling
  // (port 6543, pgbouncer=true) cannot handle — use the direct session URL
  // when available. Runtime queries keep using DATABASE_URL via the adapter.
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
  },
});
