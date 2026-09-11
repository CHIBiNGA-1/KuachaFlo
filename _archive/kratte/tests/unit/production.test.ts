import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { parseServerEnv } from "@/lib/env";
import {
  hashPassword,
  verifyPassword,
  isLegacyPasswordHash,
} from "@/lib/passwords";
import { moneyValue, orderAmount, toMinorUnits } from "@/lib/money";
import { readJson } from "@/lib/request";
import { validateRecordData, dateValue } from "@/lib/validation";
import { pageOptions } from "@/lib/pagination";
import { HttpError, errorResponse } from "@/lib/http-error";
import { analytics, dateRange } from "@/lib/analytics";
import { emptyRecords, type Entity, type Workspace } from "@/lib/types";

test("production configuration fails closed without origin/secrets", () => {
  assert.throws(() => parseServerEnv({ APP_MODE: "production" }), /APP_ORIGIN/);
  assert.throws(
    () =>
      parseServerEnv({
        APP_MODE: "production",
        APP_ORIGIN: "https://shop.example",
      }),
    /SECURITY_SECRET/,
  );
  const env = parseServerEnv({
    APP_MODE: "production",
    APP_ORIGIN: "https://shop.example",
    SECURITY_SECRET: randomBytes(32).toString("hex"),
  });
  assert.equal(env.demoEnabled, false);
  assert.equal(env.seedNewAccounts, false);
  assert.equal(env.embedded, false);
  assert.equal(env.databaseSsl, true);
  assert.equal(env.trustProxy, false);
  assert.throws(
    () => parseServerEnv({ DATABASE_POOL_MAX: "100000" }),
    /DATABASE_POOL_MAX/,
  );
  assert.throws(
    () =>
      parseServerEnv({
        APP_MODE: "production",
        APP_ORIGIN: "http://shop.example",
        SECURITY_SECRET: "x".repeat(64),
      }),
    /HTTPS/,
  );
});

test("scrypt hashes are salted, asynchronous, constant-length, and backward compatible", async () => {
  const password = "correct horse battery staple";
  const a = await hashPassword(password);
  const b = await hashPassword(password);
  assert.notEqual(a, b);
  assert.match(a, /^scrypt\$v1\$/);
  assert.equal(await verifyPassword(password, a), true);
  assert.equal(await verifyPassword("wrong password", a), false);
  assert.equal(await verifyPassword(password, null), false);
  const salt = randomBytes(16).toString("hex");
  const legacy = `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
  assert.ok(isLegacyPasswordHash(legacy));
  assert.equal(await verifyPassword(password, legacy), true);
  assert.equal(await verifyPassword(password, "malformed:hash"), false);
});

test("money is validated and calculated using integer minor units", () => {
  assert.equal(toMinorUnits(0.29), 29);
  assert.equal(
    orderAmount([
      { price: 0.1, quantity: 3 },
      { price: 0.2, quantity: 2 },
    ]),
    0.7,
  );
  assert.equal(moneyValue(19.99), 19.99);
  for (const value of [-1, NaN, Infinity, true, "12", 1.001, 1_000_000_001])
    assert.throws(() => moneyValue(value));
  assert.throws(() =>
    orderAmount([{ price: 1_000_000_000, quantity: 100000 }]),
  );
});

test("bounded request parsing rejects malformed, nested, prototype, and oversized payloads", async () => {
  const make = (body: string, contentType = "application/json") =>
    new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
    });
  assert.deepEqual(await readJson(make('{"name":"ok"}')), { name: "ok" });
  for (const body of [
    "{bad",
    "[]",
    "null",
    '{"__proto__":{"x":1}}',
    '{"a":{"constructor":"x"}}',
  ])
    await assert.rejects(
      () => readJson(make(body)),
      (error) => error instanceof HttpError && error.status === 400,
    );
  await assert.rejects(
    () => readJson(make("x", "text/plain")),
    (error) => error instanceof HttpError && error.status === 415,
  );
  await assert.rejects(
    () => readJson(make(JSON.stringify({ x: "a".repeat(500) })), 100),
    (error) => error instanceof HttpError && error.status === 413,
  );
  await assert.rejects(() =>
    readJson(make('{"x":'.repeat(20) + "1" + "}".repeat(20))),
  );
});

test("resource validation rejects type coercion, invalid dates, and authority fields", () => {
  const product = {
    name: "Coffee",
    sku: "C-001",
    category: "Beverages",
    price: 10,
    cost: 5,
    stock: 1,
    reorderAt: 2,
  };
  assert.equal(validateRecordData("inventory", product).price, 10);
  assert.throws(() =>
    validateRecordData("inventory", { ...product, stock: true }),
  );
  assert.throws(() =>
    validateRecordData("inventory", { ...product, price: "10" }),
  );
  assert.throws(() =>
    validateRecordData("inventory", { ...product, userId: "foreign-account" }),
  );
  assert.throws(() =>
    validateRecordData("inventory", {
      ...product,
      image: "javascript:alert(1)",
    }),
  );
  assert.throws(() =>
    validateRecordData("inventory", { ...product, name: "x\u0000" }),
  );
  assert.throws(() => dateValue("2026-02-30"));
  assert.equal(dateValue("2024-02-29"), "2024-02-29");
});

test("unknown exceptions never disclose SQL, credentials, or internal details", async () => {
  const result = errorResponse(
    new Error("SECRET SELECT * FROM customer_email password=hidden"),
  );
  const body = await result.text();
  assert.equal(result.status, 503);
  assert.doesNotMatch(body, /SECRET|SELECT|password|customer_email/);
  assert.ok(result.headers.get("X-Request-ID"));
});

test("keyset pagination validates limits and malformed cursors", () => {
  assert.equal(pageOptions(new URL("http://localhost?limit=200")).limit, 200);
  for (const query of [
    "limit=-1",
    "limit=201",
    "limit=1.5",
    "cursor=bad!",
    "cursor=e30",
  ])
    assert.throws(() => pageOptions(new URL(`http://localhost?${query}`)));
});

test("analytics preserve cents, compare like-for-like orders, and respect the business date", () => {
  const range = dateRange(
    7,
    "America/Los_Angeles",
    new Date("2026-01-02T02:00:00Z"),
  );
  assert.equal(range.end.getDate(), 1);
  const records = emptyRecords();
  const day = new Date().toLocaleDateString("en-CA");
  records.sales = [
    {
      id: "s",
      resource: "sales",
      name: "S",
      date: day,
      amount: 0.3,
      status: "Completed",
      channel: "Retail",
      items: [
        { productId: "p", name: "P", price: 0.1, cost: 0.03, quantity: 3 },
      ],
    } as Entity,
  ];
  records.inventory = [
    { id: "p", resource: "inventory", name: "P", stock: 10, reorderAt: 2 },
  ];
  const workspace = {
    records,
    user: {
      settings: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    },
  } as Workspace;
  const result = analytics(workspace, 7);
  assert.equal(result.revenue, 0.3);
  assert.equal(result.profit, 0.21);
  assert.equal(result.topProducts[0].sold.revenue, 0.3);
  assert.equal(
    result.points.reduce(
      (sum, point) => sum + Math.round(point.current * 100),
      0,
    ),
    30,
  );
});
