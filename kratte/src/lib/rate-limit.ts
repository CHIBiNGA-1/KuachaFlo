import "server-only";
import { createHash, createHmac } from "node:crypto";
import { isIP } from "node:net";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import { serverEnv } from "@/lib/env";
import { HttpError } from "@/lib/http-error";

export function clientIdentity(request: Request) {
  const config = serverEnv();
  // Only trust a proxy configured to overwrite X-Forwarded-For; otherwise use a shared bucket.
  if (!config.trustProxy) return "untrusted-network";
  const chain = (request.headers.get("x-forwarded-for") || "")
    .split(",")
    .map((value) => value.trim());
  const candidate = chain[Math.max(0, chain.length - config.proxyHops)];
  return candidate && isIP(candidate) ? candidate : "unknown-network";
}
export async function consumeRateLimit(
  scope: string,
  identity: string,
  limit: number,
  windowSeconds: number,
) {
  const config = serverEnv();
  const source = `${scope}:${identity}`;
  const key = config.securitySecret
    ? createHmac("sha256", config.securitySecret).update(source).digest("hex")
    : createHash("sha256").update(source).digest("hex");
  // DB time and one atomic UPSERT work across processes and replicas, including simultaneous attempts.
  const [bucket] = await db
    .insert(rateLimits)
    .values({
      key,
      count: 1,
      resetAt: sql`clock_timestamp() + ${windowSeconds} * interval '1 second'`,
    })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${rateLimits.resetAt} <= clock_timestamp() THEN 1 ELSE LEAST(${rateLimits.count} + 1, ${limit + 1}) END`,
        resetAt: sql`CASE WHEN ${rateLimits.resetAt} <= clock_timestamp() THEN clock_timestamp() + ${windowSeconds} * interval '1 second' ELSE ${rateLimits.resetAt} END`,
      },
    })
    .returning();
  if (bucket.count > limit)
    throw new HttpError(
      "Too many requests. Please wait a moment before trying again.",
      429,
      "RATE_LIMITED",
      Math.max(1, Math.ceil((bucket.resetAt.getTime() - Date.now()) / 1000)),
    );
}
export async function limitAuth(request: Request, email?: string) {
  await consumeRateLimit("auth.network", clientIdentity(request), 60, 60);
  if (email)
    await consumeRateLimit("auth.account", email.toLowerCase(), 12, 900);
}
