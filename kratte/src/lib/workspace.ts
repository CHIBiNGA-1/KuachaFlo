import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { users, records } from "@/db/schema";
import { appendAudit } from "@/lib/audit";
import {
  assertSession,
  insertSession,
  prepareSession,
  publicProfile,
  publishSession,
} from "@/lib/auth";
import { seedWorkspace } from "@/lib/seed";
import { serverEnv } from "@/lib/env";
import { clientIdentity, consumeRateLimit } from "@/lib/rate-limit";
import { HttpError, ValidationError } from "@/lib/http-error";
import { allowedKeys, objectInput, stringValue } from "@/lib/request";
import {
  emptyRecords,
  resources,
  type Resource,
  type StoreSettings,
} from "@/lib/types";

export async function createDemoWorkspace(request: Request, requestId: string) {
  if (!serverEnv().demoEnabled)
    throw new HttpError(
      "Sign in or create an account to open your workspace.",
      401,
      "SESSION_EXPIRED",
    );
  await consumeRateLimit(
    "demo.create",
    clientIdentity(request),
    serverEnv().production ? 5 : 60,
    3600,
  );
  const session = prepareSession();
  const user = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        email: `demo-${randomUUID()}@kratte.local`,
        name: "Alex Morgan",
        storeName: "The Everyday Store",
        isDemo: true,
      })
      .returning();
    await seedWorkspace(created.id, tx);
    await insertSession(tx, created.id, session);
    await appendAudit(tx, {
      userId: created.id,
      action: "workspace.demo_created",
      resource: "workspace",
      requestId,
    });
    return created;
  });
  await publishSession(session, "demo");
  return user;
}
export async function workspaceSnapshot(userId: string) {
  return db.transaction(
    async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId));
      if (!user)
        throw new HttpError(
          "Your workspace is no longer available.",
          401,
          "SESSION_EXPIRED",
        );
      const rows = await tx
        .select()
        .from(records)
        .where(eq(records.userId, userId))
        .orderBy(desc(records.createdAt), desc(records.id))
        .limit(serverEnv().snapshotLimit + 1);
      if (rows.length > serverEnv().snapshotLimit)
        throw new HttpError(
          "This workspace exceeds the interactive snapshot limit. Use the paginated records API or contact your administrator to increase the configured limit.",
          413,
          "WORKSPACE_TOO_LARGE",
        );
      const grouped = emptyRecords();
      for (const row of rows)
        if (resources.includes(row.resource as Resource))
          grouped[row.resource as Resource].push({
            ...row.data,
            id: row.id,
            resource: row.resource as Resource,
            version: row.version,
          });
      grouped.sales.sort(
        (a, b) =>
          (b.date || "").localeCompare(a.date || "") ||
          b.name.localeCompare(a.name),
      );
      grouped.inventory.sort((a, b) =>
        (a.sku || "").localeCompare(b.sku || ""),
      );
      const snapshot = { user: publicProfile(user), records: grouped };
      if (Buffer.byteLength(JSON.stringify(snapshot)) > 16 * 1024 * 1024)
        throw new HttpError(
          "The workspace snapshot is too large. Use the paginated records API.",
          413,
          "WORKSPACE_TOO_LARGE",
        );
      return snapshot;
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function updateWorkspace(
  userId: string,
  sessionId: string,
  input: Record<string, unknown>,
  requestId: string,
) {
  allowedKeys(input, ["name", "storeName", "settings", "action"]);
  if (input.action !== undefined && input.action !== "start-trial")
    throw new ValidationError("Choose a valid workspace action.");
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    await assertSession(tx, userId, sessionId);
    const settings: StoreSettings = { ...user.settings };
    const update: Partial<typeof users.$inferInsert> = {};
    for (const key of ["name", "storeName"] as const)
      if (input[key] !== undefined)
        update[key] = stringValue(
          input[key],
          key === "name" ? "Name" : "Store name",
          { min: 1, max: 100 },
        );
    if (input.settings !== undefined) {
      const values = objectInput(input.settings, "Settings");
      allowedKeys(values, [
        "currency",
        "timezone",
        "inventoryView",
        "inventoryDensity",
        "showDashboardInsights",
        "showInventorySummary",
        "lowStockAlerts",
        "orderNotifications",
        "weeklyDigest",
        "dismissedNotifications",
      ]);
      if (values.currency !== undefined) {
        if (
          typeof values.currency !== "string" ||
          ![
            "USD",
            "EUR",
            "GBP",
            "CAD",
            "AUD",
            "INR",
            "JPY",
            "NGN",
            "KES",
            "AED",
          ].includes(values.currency)
        )
          throw new ValidationError("Choose a supported currency.");
        if (values.currency !== settings.currency) {
          const [transaction] = await tx
            .select({ id: records.id })
            .from(records)
            .where(
              and(
                eq(records.userId, userId),
                inArray(records.resource, ["sales", "purchases", "expenses"]),
              ),
            )
            .limit(1);
          if (transaction && !user.isDemo)
            throw new HttpError(
              "Currency is locked after your first financial transaction to protect financial history. Use a separate workspace for a different currency.",
              409,
              "CURRENCY_LOCKED",
            );
        }
        settings.currency = values.currency;
      }
      if (values.timezone !== undefined) {
        const zone = stringValue(values.timezone, "Time zone", {
          min: 1,
          max: 100,
        });
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: zone });
          settings.timezone = zone;
        } catch {
          throw new ValidationError("Choose a valid time zone.");
        }
      }
      if (values.inventoryView !== undefined) {
        if (
          typeof values.inventoryView !== "string" ||
          !["board", "table"].includes(values.inventoryView)
        )
          throw new ValidationError("Choose Board or Table view.");
        settings.inventoryView = values.inventoryView as "board" | "table";
      }
      if (values.inventoryDensity !== undefined) {
        if (
          typeof values.inventoryDensity !== "string" ||
          !["comfortable", "compact"].includes(values.inventoryDensity)
        )
          throw new ValidationError("Choose a valid board density.");
        settings.inventoryDensity = values.inventoryDensity as
          | "comfortable"
          | "compact";
      }
      for (const key of [
        "lowStockAlerts",
        "orderNotifications",
        "weeklyDigest",
        "showDashboardInsights",
        "showInventorySummary",
      ] as const)
        if (values[key] !== undefined) {
          if (typeof values[key] !== "boolean")
            throw new ValidationError(
              "Display and notification preferences must be true or false.",
            );
          settings[key] = values[key];
        }
      if (values.dismissedNotifications !== undefined) {
        if (
          !Array.isArray(values.dismissedNotifications) ||
          values.dismissedNotifications.length > 500
        )
          throw new ValidationError(
            "At most 500 notification IDs are supported.",
          );
        settings.dismissedNotifications = [
          ...new Set(
            values.dismissedNotifications.map((value) =>
              stringValue(value, "Notification ID", { min: 1, max: 120 }),
            ),
          ),
        ];
      }
    }
    if (input.action === "start-trial") {
      if (settings.trialEnds)
        throw new HttpError(
          "Your workspace has already started its Pro trial.",
          409,
          "TRIAL_ALREADY_STARTED",
        );
      settings.plan = "Pro trial";
      settings.trialEnds = new Date(Date.now() + 14 * 86400000).toISOString();
    }
    const [saved] = await tx
      .update(users)
      .set({ ...update, settings })
      .where(eq(users.id, userId))
      .returning();
    await appendAudit(tx, {
      userId,
      requestId,
      resource: "workspace",
      action: "workspace.updated",
      metadata: {
        fields: [
          ...Object.keys(update),
          ...Object.keys((input.settings || {}) as object),
          ...(input.action ? ["trial"] : []),
        ],
      },
    });
    return publicProfile(saved);
  });
}
