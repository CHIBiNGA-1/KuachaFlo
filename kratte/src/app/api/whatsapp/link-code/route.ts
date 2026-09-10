import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { currentUser, checkOrigin } from "@/lib/auth";
import { withApi, HttpError } from "@/lib/http-error";
import { consumeRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LINK_CODE_TTL_MINUTES = 15;

export async function POST(request: Request) {
  return withApi(request, "whatsapp.link-code", async () => {
    checkOrigin(request);
    const user = await currentUser();
    if (!user)
      throw new HttpError(
        "Your session has ended. Sign in again to continue.",
        401,
        "SESSION_EXPIRED",
      );
    await consumeRateLimit("whatsapp.link-code", user.id, 20, 60);

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const expires = new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60_000);

    await db
      .update(users)
      .set({ whatsappLinkCode: code, whatsappLinkCodeExpires: expires })
      .where(eq(users.id, user.id));

    return NextResponse.json({
      code,
      expiresInMinutes: LINK_CODE_TTL_MINUTES,
      alreadyLinked: Boolean(user.whatsappNumber),
      whatsappNumber: user.whatsappNumber,
    });
  });
}

export async function DELETE(request: Request) {
  return withApi(request, "whatsapp.unlink", async () => {
    checkOrigin(request);
    const user = await currentUser();
    if (!user)
      throw new HttpError(
        "Your session has ended. Sign in again to continue.",
        401,
        "SESSION_EXPIRED",
      );
    await db
      .update(users)
      .set({
        whatsappNumber: null,
        whatsappLinkCode: null,
        whatsappLinkCodeExpires: null,
      })
      .where(eq(users.id, user.id));
    return NextResponse.json({ ok: true });
  });
}
