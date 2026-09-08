import { NextResponse } from "next/server";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import { requireWorkspaceUser } from "@/lib/auth";
import { withApi } from "@/lib/http-error";
import { consumeRateLimit } from "@/lib/rate-limit";
import { nextCursor, pageOptions } from "@/lib/pagination";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withApi(request, "audit.list", async () => {
    const user = await requireWorkspaceUser(request);
    await consumeRateLimit("audit.read", user.id, 120, 60);
    const { limit, cursor } = pageOptions(new URL(request.url));
    const rows = await db
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        resource: auditEvents.resource,
        recordId: auditEvents.recordId,
        requestId: auditEvents.requestId,
        metadata: auditEvents.metadata,
        createdAt: auditEvents.createdAt,
        cursorDate: sql<string>`to_char(${auditEvents.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')`,
      })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.userId, user.id),
          cursor
            ? or(
                lt(
                  auditEvents.createdAt,
                  sql`${cursor.date + "Z"}::timestamptz`,
                ),
                and(
                  eq(
                    auditEvents.createdAt,
                    sql`${cursor.date + "Z"}::timestamptz`,
                  ),
                  lt(auditEvents.id, cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
      .limit(limit + 1);
    const events = rows.slice(0, limit);
    return NextResponse.json({
      events: events.map(({ cursorDate: _cursorDate, ...event }) => event),
      nextCursor:
        rows.length > limit ? nextCursor(events[events.length - 1]) : null,
    });
  });
}
