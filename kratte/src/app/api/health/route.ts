import { db } from "@/db";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { withApi } from "@/lib/http-error";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return withApi(request, "health.ready", async () => {
    // Readiness verifies the schema required by this release, not only a TCP connection.
    await db.execute(sql`SELECT version FROM shop_records LIMIT 0`);
    await db.execute(sql`SELECT key FROM shop_rate_limits LIMIT 0`);
    await db.execute(sql`SELECT id FROM shop_audit_events LIMIT 0`);
    await db.execute(sql`SELECT value FROM shop_order_sequences LIMIT 0`);
    return NextResponse.json({ ok: true });
  });
}
