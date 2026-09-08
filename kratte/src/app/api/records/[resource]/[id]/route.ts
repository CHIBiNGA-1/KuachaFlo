import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { records } from "@/db/schema";
import { requireWorkspaceUser, checkOrigin } from "@/lib/auth";
import { HttpError, ValidationError, withApi } from "@/lib/http-error";
import { consumeRateLimit } from "@/lib/rate-limit";
import { readJson, UUID_PATTERN } from "@/lib/request";
import { expectedVersion } from "@/lib/pagination";
import { mutateRecord, parseResource, toEntity } from "@/lib/store";
export const runtime = "nodejs";
type Context = { params: Promise<{ resource: string; id: string }> };

export async function GET(request: Request, context: Context) {
  return withApi(request, "records.read", async () => {
    const user = await requireWorkspaceUser(request);
    await consumeRateLimit("records.read", user.id, 300, 60);
    const { resource: raw, id } = await context.params;
    const resource = parseResource(raw);
    if (!UUID_PATTERN.test(id)) throw new ValidationError("Invalid record ID.");
    const [row] = await db
      .select()
      .from(records)
      .where(
        and(
          eq(records.userId, user.id),
          eq(records.resource, resource),
          eq(records.id, id),
        ),
      );
    if (!row)
      throw new HttpError("This record no longer exists.", 404, "NOT_FOUND");
    return NextResponse.json(
      { record: toEntity(row) },
      { headers: { ETag: `"${row.version}"` } },
    );
  });
}
export async function PATCH(request: Request, context: Context) {
  return withApi(request, "records.update", async ({ requestId }) => {
    checkOrigin(request);
    const user = await requireWorkspaceUser(request);
    await consumeRateLimit("records.write", user.id, 300, 60);
    const { resource, id } = await context.params;
    const input = expectedVersion(request, await readJson(request));
    const result = await mutateRecord(
      user.id,
      parseResource(resource),
      input,
      id,
      false,
      request.headers.get("Idempotency-Key"),
      { requestId, sessionId: user.sessionId },
    );
    return NextResponse.json(result, {
      headers: result.record?.version
        ? { ETag: `"${result.record.version}"` }
        : undefined,
    });
  });
}
export async function DELETE(request: Request, context: Context) {
  return withApi(request, "records.delete", async ({ requestId }) => {
    checkOrigin(request);
    const user = await requireWorkspaceUser(request);
    await consumeRateLimit("records.write", user.id, 300, 60);
    const { resource, id } = await context.params;
    const input = request.headers.has("if-match")
      ? expectedVersion(request, {})
      : undefined;
    const result = await mutateRecord(
      user.id,
      parseResource(resource),
      input,
      id,
      true,
      request.headers.get("Idempotency-Key"),
      { requestId, sessionId: user.sessionId },
    );
    return NextResponse.json({ ok: true, ...result });
  });
}
