import "dotenv/config";
import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";

async function main() {
  if (process.env.MIGRATION_DATABASE_URL)
    process.env.DATABASE_URL = process.env.MIGRATION_DATABASE_URL;
  const { db, pool } = await import("@/db");
  await db.execute(sql`SELECT 1`);
  // Pin the migration lock and migration transaction to the same PostgreSQL connection.
  const client = await pool.connect();
  const migrationDb = drizzle(client);
  let locked = false;
  try {
    await migrationDb.execute(sql`SELECT pg_advisory_lock(1936224119, 1)`);
    locked = true;
    const baseline = readMigrationFiles({ migrationsFolder: "drizzle" })[0];
    if (process.argv.includes("--adopt-existing")) {
      const snapshot = JSON.parse(
        await readFile("drizzle/meta/0000_snapshot.json", "utf8"),
      ) as {
        tables: Record<
          string,
          {
            name: string;
            columns: Record<string, { type: string; notNull: boolean }>;
          }
        >;
      };
      const columns = await migrationDb.execute<{
        table_name: string;
        column_name: string;
        data_type: string;
        is_nullable: string;
      }>(
        sql`SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public'`,
      );
      const normalize = (type: string) =>
        type
          .replace(/timestamp without time zone/, "timestamp")
          .replace(/character varying/, "varchar");
      for (const table of Object.values(snapshot.tables))
        for (const [name, expected] of Object.entries(table.columns)) {
          const actual = columns.rows.find(
            (column) =>
              column.table_name === table.name && column.column_name === name,
          );
          if (
            !actual ||
            normalize(actual.data_type) !== normalize(expected.type) ||
            (actual.is_nullable === "NO") !== expected.notNull
          )
            throw new Error(
              `Baseline mismatch at ${table.name}.${name}; adoption refused. Review the existing schema first.`,
            );
        }
      await migrationDb.execute(sql`CREATE SCHEMA IF NOT EXISTS drizzle`);
      await migrationDb.execute(
        sql`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
      );
      const history = await migrationDb.execute(
        sql`SELECT id FROM drizzle.__drizzle_migrations LIMIT 1`,
      );
      if (!history.rows.length) {
        await migrationDb.execute(
          sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${baseline.hash}, ${baseline.folderMillis})`,
        );
        console.info(
          "Adopted the verified pre-migration baseline. Existing rows are untouched.",
        );
      }
    }
    await migrate(migrationDb, { migrationsFolder: "drizzle" });
    console.info("Database migrations are current.");
  } finally {
    if (locked)
      await migrationDb.execute(sql`SELECT pg_advisory_unlock(1936224119, 1)`);
    client.release();
    await pool.end();
  }
}
main().catch((error) => {
  // Drizzle errors can contain SQL parameters: report only a safe operation message/code.
  console.error(
    "Migration failed. Inspect the migration and database constraints before retrying. No destructive reset was performed.",
    { code: error?.cause?.code || error?.code || "MIGRATION_FAILED" },
  );
  process.exitCode = 1;
});
