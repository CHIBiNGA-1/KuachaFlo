import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, hashPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function verifyToken(token: string): { email: string; name: string } | null {
  const secret = process.env.KRATTE_SSO_SECRET;
  if (!secret) return null;

  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) return null;

  const expected = createHmac("sha256", secret).update(payloadB64).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (typeof payload.exp !== "number" || Date.now() > payload.exp * 1000) return null;
    if (typeof payload.email !== "string" || !payload.email) return null;
    return { email: payload.email, name: payload.name || payload.email.split("@")[0] };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const redirectTo = new URL("/", url.origin);

  if (!token) {
    redirectTo.searchParams.set("sso_error", "missing_token");
    return NextResponse.redirect(redirectTo);
  }

  const claim = verifyToken(token);
  if (!claim) {
    redirectTo.searchParams.set("sso_error", "invalid_or_expired");
    return NextResponse.redirect(redirectTo);
  }

  const normalizedEmail = claim.email.trim().toLowerCase();

  // One identity per email across both apps: if this email already has a
  // KraTte account (made via SSO before, or signed up directly with the
  // same email), log into that account rather than creating a duplicate.
  const [existing] = await db
    .select()
    .from(users)
    .where(sql`lower(btrim(${users.email})) = ${normalizedEmail}`);

  let userId = existing?.id;

  if (!userId) {
    // Provisioned accounts are real, permanent accounts (not demo — demo
    // accounts are subject to periodic cleanup) that the user will only
    // ever reach via this SSO redirect. A random password satisfies the
    // "non-demo accounts need a password hash" constraint without the
    // user ever needing to know or use it.
    const passwordHash = await hashPassword(randomBytes(32).toString("hex"));
    const [created] = await db
      .insert(users)
      .values({
        email: claim.email.trim(),
        name: claim.name,
        passwordHash,
        isDemo: false,
      })
      .returning({ id: users.id });
    userId = created.id;
  }

  await createSession(userId);
  return NextResponse.redirect(redirectTo);
}
