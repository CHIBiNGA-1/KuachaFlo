import { NextResponse } from "next/server";
import { and, desc, eq, lt, or, sql, getTableColumns } from "drizzle-orm";
import { db } from "@/db";
import { records } from "@/db/schema";
import { requireWorkspaceUser, checkOrigin } from "@/lib/auth";
import { HttpError, withApi } from "@/lib/http-error";
import { readJson } from "@/lib/request";
import { consumeRateLimit } from "@/lib/rate-limit";
import { mutateRecord, parseResource, toEntity } from "@/lib/store";
import { nextCursor, pageOptions } from "@/lib/pagination";
import { serverEnv } from "@/lib/env";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ resource: string }> };

export async function GET(request: Request, context: Context) {
  return withApi(request, "records.list", async () => {
    const user = await requireWorkspaceUser(request);
    await consumeRateLimit("records.read", user.id, 300, 60);
    const resource = parseResource((await context.params).resource);
    const url = new URL(request.url);
    const paginated =
      url.searchParams.has("limit") || url.searchParams.has("cursor");
    const { limit, cursor } = pageOptions(url);
    const requested = paginated ? limit : serverEnv().snapshotLimit;
    const rows = await db
      .select({
        ...getTableColumns(records),
        cursorDate: sql<string>`to_char(${records.createdAt}, 'YYYY-MM-DD"T"HH24:MI:SS.US')`,
      })
      .from(records)
      .where(
        and(
          eq(records.userId, user.id),
          eq(records.resource, resource),
          cursor
            ? or(
                lt(records.createdAt, sql`${cursor.date}::timestamp`),
                and(
                  eq(records.createdAt, sql`${cursor.date}::timestamp`),
                  lt(records.id, cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(records.createdAt), desc(records.id))
      .limit(requested + 1);
    if (!paginated && rows.length > requested)
      throw new HttpError(
        "Use the paginated endpoint with ?limit=200 to read this collection.",
        413,
        "PAGINATION_REQUIRED",
      );
    const selected = rows.slice(0, requested);
    return NextResponse.json(
      paginated
        ? {
            records: selected.map(toEntity),
            nextCursor:
              rows.length > limit && selected.length
                ? nextCursor(selected[selected.length - 1])
                : null,
          }
        : selected.map(toEntity),
    );
  });
}
export async function POST(request: Request, context: Context) {
  return withApi(request, "records.create", async ({ requestId }) => {
    checkOrigin(request);
    const user = await requireWorkspaceUser(request);
    await consumeRateLimit("records.write", user.id, 300, 60);
    const resource = parseResource((await context.params).resource);
    const input = await readJson(request);
    const result = await mutateRecord(
      user.id,
      resource,
      input,
      undefined,
      false,
      request.headers.get("Idempotency-Key"),
      { requestId, sessionId: user.sessionId },
    );
    return NextResponse.json(result, { status: 201 });
  });
}
