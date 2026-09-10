import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { db, type Transaction } from "@/db";
import { sessions, users } from "@/db/schema";
import { serverEnv } from "@/lib/env";
import { HttpError } from "@/lib/http-error";
import type { Profile } from "@/lib/types";
export { checkOrigin } from "@/lib/security";
export { hashPassword, verifyPassword } from "@/lib/passwords";

const SESSION_COOKIE = "kratte_session_v2";
const WORKSPACE_COOKIE = "kratte_workspace";
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
function cookieOptions() {
  const secure = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure,
    sameSite:
      serverEnv().embedded && secure ? ("none" as const) : ("lax" as const),
    partitioned: serverEnv().embedded && secure,
    path: "/",
  };
}
export function prepareSession() {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    id: digest(token),
    expiresAt: new Date(Date.now() + serverEnv().sessionDays * 86400000),
  };
}
export type PreparedSession = ReturnType<typeof prepareSession>;
export async function insertSession(
  tx: Transaction,
  userId: string,
  session: PreparedSession,
) {
  await tx
    .insert(sessions)
    .values({ id: session.id, userId, expiresAt: session.expiresAt });
  const extra = await tx
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.createdAt), desc(sessions.id))
    .offset(serverEnv().maxSessions);
  if (extra.length)
    await tx.delete(sessions).where(
      inArray(
        sessions.id,
        extra.map((row) => row.id),
      ),
    );
}
export async function publishSession(
  session: PreparedSession,
  kind: "account" | "demo" = "account",
) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, session.token, {
    ...cookieOptions(),
    expires: session.expiresAt,
  });
  jar.set(WORKSPACE_COOKIE, kind, { ...cookieOptions(), maxAge: 365 * 86400 });
  jar.delete("shopwise_session");
}
export async function createSession(
  userId: string,
  kind: "account" | "demo" = "account",
) {
  const session = prepareSession();
  await db.transaction(async (tx) => {
    await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    await insertSession(tx, userId, session);
  });
  await publishSession(session, kind);
}
export async function currentUser() {
  const jar = await cookies();
  const token =
    jar.get(SESSION_COOKIE)?.value || jar.get("shopwise_session")?.value;
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) return null;
  const sessionId = digest(token);
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row ? { ...row.user, sessionId } : null;
}
export async function hasSessionContext(request?: Request) {
  const jar = await cookies();
  return (
    jar.has(SESSION_COOKIE) ||
    jar.has("shopwise_session") ||
    jar.has(WORKSPACE_COOKIE) ||
    !!request?.headers.get("X-KraTte-Workspace")
  );
}
export async function maintainSession(user: typeof users.$inferSelect) {
  const jar = await cookies();
  if (!jar.has(SESSION_COOKIE)) {
    await destroySession();
    await createSession(user.id, user.isDemo ? "demo" : "account");
  } else if (!jar.has(WORKSPACE_COOKIE))
    jar.set(WORKSPACE_COOKIE, user.isDemo ? "demo" : "account", {
      ...cookieOptions(),
      maxAge: 365 * 86400,
    });
}
export async function requireWorkspaceUser(request: Request) {
  const user = await currentUser();
  if (!user)
    throw new HttpError(
      "Your session has ended. Sign in again to continue with the same workspace.",
      401,
      "SESSION_EXPIRED",
    );
  const expected = request.headers.get("X-KraTte-Workspace");
  if (expected && expected !== user.id)
    throw new HttpError(
      "The active account changed in another tab. Reconnect to your original workspace before saving.",
      409,
      "WORKSPACE_CHANGED",
    );
  return user;
}
export async function assertSession(
  tx: Transaction,
  userId: string,
  sessionId: string,
) {
  const [valid] = await tx
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.id, sessionId),
        eq(sessions.userId, userId),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!valid)
    throw new HttpError(
      "Your session has ended. Sign in again to continue.",
      401,
      "SESSION_EXPIRED",
    );
}
export async function destroySession() {
  const jar = await cookies();
  const tokens = [
    jar.get(SESSION_COOKIE)?.value,
    jar.get("shopwise_session")?.value,
  ].filter(
    (token): token is string => !!token && /^[a-f0-9]{64}$/i.test(token),
  );
  if (tokens.length)
    await db.delete(sessions).where(inArray(sessions.id, tokens.map(digest)));
  jar.set(SESSION_COOKIE, "", {
    ...cookieOptions(),
    maxAge: 0,
    expires: new Date(0),
  });
  jar.delete("shopwise_session");
}
export function publicProfile(user: typeof users.$inferSelect): Profile {
  return {
    id: user.id,
    email: user.isDemo ? "alex@everyday.store" : user.email,
    name: user.name,
    storeName: user.storeName,
    isDemo: user.isDemo,
    settings: user.settings,
  };
}
