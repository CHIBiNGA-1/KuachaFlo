import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { users, records, auditEvents } from "@/db/schema";
import { databaseErrorCode } from "@/lib/logger";
import { consumeRateLimit } from "@/lib/rate-limit";
import { HttpError } from "@/lib/http-error";

if (process.env.APP_MODE === "production")
  throw new Error(
    "Database invariant tests must run only against an isolated test database.",
  );

test("database enforces case-insensitive SKU uniqueness and valid inventory values", async () => {
  const [user] = await db
    .insert(users)
    .values({
      email: `db-test-${randomUUID()}@example.com`,
      name: "DB test",
      isDemo: true,
    })
    .returning();
  const product = {
    name: "Invariant item",
    sku: "Unique-SKU",
    category: "Other",
    price: 10,
    cost: 5,
    stock: 5,
    reorderAt: 1,
  };
  try {
    await db
      .insert(records)
      .values({ userId: user.id, resource: "inventory", data: product });
    await assert.rejects(
      () =>
        db
          .insert(records)
          .values({
            userId: user.id,
            resource: "inventory",
            data: { ...product, sku: "unique-sku" },
          }),
      (error) => databaseErrorCode(error) === "23505",
    );
    await assert.rejects(
      () =>
        db
          .insert(records)
          .values({
            userId: user.id,
            resource: "inventory",
            data: { ...product, sku: "BAD", stock: -1 },
          }),
      (error) => databaseErrorCode(error) === "23514",
    );
    await assert.rejects(
      () =>
        db
          .insert(records)
          .values({
            userId: user.id,
            resource: "unexpected",
            data: { name: "Wrong type" },
          }),
      (error) => databaseErrorCode(error) === "23514",
    );
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

test("data changes and audit records roll back together", async () => {
  const [user] = await db
    .insert(users)
    .values({
      email: `audit-test-${randomUUID()}@example.com`,
      name: "Audit test",
      isDemo: true,
    })
    .returning();
  try {
    await assert.rejects(
      () =>
        db.transaction(async (tx) => {
          await tx
            .insert(records)
            .values({
              userId: user.id,
              resource: "expenses",
              data: { name: "Rolled back", amount: 20 },
            });
          await tx
            .insert(auditEvents)
            .values({
              userId: user.id,
              action: "test.rollback",
              resource: "expenses",
              requestId: randomUUID(),
            });
          throw new Error("Intentional test rollback");
        }),
      /Intentional test rollback/,
    );
    assert.equal(
      (await db.select().from(records).where(eq(records.userId, user.id)))
        .length,
      0,
    );
    assert.equal(
      (
        await db
          .select()
          .from(auditEvents)
          .where(eq(auditEvents.userId, user.id))
      ).length,
      0,
    );
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

test("shared rate-limit counters remain atomic under concurrent requests", async () => {
  const identity = randomUUID();
  const outcomes = await Promise.all(
    Array.from({ length: 12 }, async () => {
      try {
        await consumeRateLimit("integration.atomic", identity, 5, 60);
        return "allowed";
      } catch (error) {
        assert.ok(error instanceof HttpError);
        assert.equal(error.status, 429);
        return "blocked";
      }
    }),
  );
  assert.equal(outcomes.filter((value) => value === "allowed").length, 5);
  assert.equal(outcomes.filter((value) => value === "blocked").length, 7);
});

test.after(async () => {
  await pool.end();
});
