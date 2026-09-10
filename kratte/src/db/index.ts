import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { serverEnv } from "@/lib/env";
import { databaseErrorCode, logEvent } from "@/lib/logger";

const config = serverEnv();
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
let parsed: URL;
try {
  parsed = new URL(databaseUrl);
} catch {
  throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
}
if (!["postgres:", "postgresql:"].includes(parsed.protocol))
  throw new Error("DATABASE_URL must use PostgreSQL.");
if (config.databaseSsl) {
  // Prevent connection-string options from silently overriding certificate verification.
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
    parsed.searchParams.delete(key);
}
const globalForDb = globalThis as typeof globalThis & { __krattePool?: Pool };
export const pool =
  globalForDb.__krattePool ??
  new Pool({
    connectionString: parsed.toString(),
    max: config.poolMax,
    connectionTimeoutMillis: config.connectionTimeoutMs,
    idleTimeoutMillis: 30000,
    statement_timeout: config.statementTimeoutMs,
    query_timeout: config.statementTimeoutMs + 2000,
    lock_timeout: 3000,
    idle_in_transaction_session_timeout: 15000,
    application_name: "kratte",
    allowExitOnIdle: true,
    ...(config.databaseSsl
      ? {
          ssl: {
            rejectUnauthorized: true,
            ...(config.databaseCa ? { ca: config.databaseCa } : {}),
          },
        }
      : {}),
  });
if (!globalForDb.__krattePool) {
  pool.on("error", (error) =>
    logEvent("error", "database.idle_connection_error", {
      code: databaseErrorCode(error) || "CONNECTION_ERROR",
    }),
  );
  globalForDb.__krattePool = pool;
}
export const db = drizzle(pool);
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
