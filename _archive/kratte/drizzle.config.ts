import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!url)
  throw new Error(
    "Set DATABASE_URL or MIGRATION_DATABASE_URL before running database migrations.",
  );

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: false,
});
