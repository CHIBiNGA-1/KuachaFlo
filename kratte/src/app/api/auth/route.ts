import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, sessions } from "@/db/schema";
import {
  currentUser,
  publicProfile,
  destroySession,
  checkOrigin,
  hasSessionContext,
  prepareSession,
  insertSession,
  publishSession,
  assertSession,
} from "@/lib/auth";
import {
  hashPassword,
  verifyPassword,
  isLegacyPasswordHash,
} from "@/lib/passwords";
import { appendAudit } from "@/lib/audit";
import { limitAuth } from "@/lib/rate-limit";
import { serverEnv } from "@/lib/env";
import { HttpError, ValidationError, withApi } from "@/lib/http-error";
import { allowedKeys, readJson, stringValue } from "@/lib/request";
import { seedWorkspace } from "@/lib/seed";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return withApi(request, "auth.session", async () => {
    const user = await currentUser();
    return NextResponse.json({
      user: user ? publicProfile(user) : null,
      sessionExpired: !user && (await hasSessionContext()),
    });
  });
}
export async function POST(request: Request) {
  return withApi(request, "auth.mutate", async ({ requestId }) => {
    checkOrigin(request);
    const input = await readJson(request, 16 * 1024);
    allowedKeys(input, [
      "action",
      "email",
      "password",
      "name",
      "storeName",
      "currentPassword",
    ]);
    if (
      typeof input.action !== "string" ||
      !["login", "register", "password", "logout"].includes(input.action)
    )
      throw new ValidationError("Choose a valid account action.");
    if (input.action === "logout") {
      const user = await currentUser();
      if (user)
        await db.transaction(async (tx) => {
          await tx
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, user.id))
            .for("update");
          await tx.delete(sessions).where(eq(sessions.id, user.sessionId));
          await appendAudit(tx, {
            userId: user.id,
            action: "auth.logout",
            resource: "account",
            requestId,
          });
        });
      await destroySession();
      return NextResponse.json({ ok: true });
    }
    const password = stringValue(input.password, "Password", {
      min: 8,
      max: 128,
      trim: false,
    });
    if (input.action === "password") {
      const user = await currentUser();
      if (!user)
        throw new HttpError(
          "Your session has ended. Sign in again to change your password.",
          401,
          "SESSION_EXPIRED",
        );
      await limitAuth(request, user.email);
      const oldPassword = stringValue(
        input.currentPassword,
        "Current password",
        { min: 1, max: 128, trim: false },
      );
      if (!user.passwordHash)
        throw new ValidationError(
          "Create an account before setting a password.",
        );
      if (!(await verifyPassword(oldPassword, user.passwordHash)))
        throw new ValidationError("Your current password is incorrect.");
      const hash = await hashPassword(password);
      const session = prepareSession();
      await db.transaction(async (tx) => {
        const [locked] = await tx
          .select()
          .from(users)
          .where(eq(users.id, user.id))
          .for("update");
        await assertSession(tx, user.id, user.sessionId);
        if (locked.passwordHash !== user.passwordHash)
          throw new HttpError(
            "Your password was changed in another session. Sign in again.",
            409,
            "CREDENTIALS_CHANGED",
          );
        await tx
          .update(users)
          .set({ passwordHash: hash })
          .where(eq(users.id, user.id));
        await tx.delete(sessions).where(eq(sessions.userId, user.id));
        await insertSession(tx, user.id, session);
        await appendAudit(tx, {
          userId: user.id,
          action: "auth.password_changed",
          resource: "account",
          requestId,
        });
      });
      await publishSession(session);
      return NextResponse.json({ ok: true });
    }
    const email = stringValue(input.email, "Email", {
      min: 3,
      max: 254,
    }).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new ValidationError("Enter a valid email address.");
    await limitAuth(request, email);
    if (input.action === "login") {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (
        !(await verifyPassword(password, user?.passwordHash)) ||
        !user ||
        user.isDemo
      )
        throw new HttpError(
          "That email and password don’t match. Please try again.",
          400,
          "INVALID_CREDENTIALS",
        );
      const upgradedHash = isLegacyPasswordHash(user.passwordHash || "")
        ? await hashPassword(password)
        : undefined;
      const previous = await currentUser();
      const session = prepareSession();
      await db.transaction(async (tx) => {
        const [locked] = await tx
          .select()
          .from(users)
          .where(eq(users.id, user.id))
          .for("update");
        if (!locked || locked.passwordHash !== user.passwordHash)
          throw new HttpError(
            "Account credentials changed. Please sign in again.",
            409,
            "CREDENTIALS_CHANGED",
          );
        if (upgradedHash)
          await tx
            .update(users)
            .set({ passwordHash: upgradedHash })
            .where(eq(users.id, user.id));
        if (previous)
          await tx.delete(sessions).where(eq(sessions.id, previous.sessionId));
        await insertSession(tx, user.id, session);
        await appendAudit(tx, {
          userId: user.id,
          action: "auth.login",
          resource: "account",
          requestId,
        });
      });
      await publishSession(session);
      return NextResponse.json({ user: publicProfile(user) });
    }
    if (!serverEnv().signupEnabled)
      throw new HttpError(
        "New account registration is currently disabled.",
        403,
        "SIGNUP_DISABLED",
      );
    const name = stringValue(input.name, "Name", { min: 1, max: 100 });
    const storeName = stringValue(input.storeName, "Store name", {
      min: 1,
      max: 100,
    });
    const guest = await currentUser();
    const jar = await cookies();
    if (
      !guest &&
      (jar.has("shopwise_session_v2") || jar.has("shopwise_session"))
    )
      throw new HttpError(
        "The original session changed during sign-up. Sign in or explicitly open a fresh demo before trying again.",
        409,
        "SESSION_CHANGED",
      );
    const passwordHash = await hashPassword(password);
    if (guest && !guest.isDemo)
      throw new HttpError(
        "Sign out before creating another account.",
        409,
        "ALREADY_SIGNED_IN",
      );
    const session = prepareSession();
    const user = await db.transaction(async (tx) => {
      let created: typeof users.$inferSelect;
      if (guest?.isDemo) {
        const [locked] = await tx
          .select()
          .from(users)
          .where(eq(users.id, guest.id))
          .for("update");
        if (!locked?.isDemo)
          throw new HttpError(
            "This demo has already been secured. Sign in to its account.",
            409,
            "ACCOUNT_ALREADY_CLAIMED",
          );
        await assertSession(tx, guest.id, guest.sessionId);
        [created] = await tx
          .update(users)
          .set({ email, name, storeName, passwordHash, isDemo: false })
          .where(eq(users.id, guest.id))
          .returning();
        await tx.delete(sessions).where(eq(sessions.userId, guest.id));
      } else {
        [created] = await tx
          .insert(users)
          .values({ email, name, storeName, passwordHash, isDemo: false })
          .returning();
        if (serverEnv().seedNewAccounts) await seedWorkspace(created.id, tx);
      }
      await insertSession(tx, created.id, session);
      await appendAudit(tx, {
        userId: created.id,
        action: "auth.register",
        resource: "account",
        requestId,
      });
      return created;
    });
    await publishSession(session);
    return NextResponse.json({ user: publicProfile(user) }, { status: 201 });
  });
}
