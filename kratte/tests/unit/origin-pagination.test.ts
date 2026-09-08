import test from "node:test";
import assert from "node:assert/strict";
import { parseServerEnv } from "@/lib/env";
import { checkOrigin } from "@/lib/security";
import { nextCursor, pageOptions } from "@/lib/pagination";

const production = parseServerEnv({
  APP_MODE: "production",
  APP_ORIGIN: "https://shop.example",
  SECURITY_SECRET: "x".repeat(64),
});
const preview = parseServerEnv({ APP_MODE: "preview", TRUST_PROXY: "true" });
const request = (origin: string) =>
  new Request("http://shop.example/api/test", {
    method: "POST",
    headers: {
      Origin: origin,
      Host: "shop.example",
      "X-Forwarded-Host": "shop.example",
      "X-Forwarded-Proto": "http",
    },
  });

test("production always requires its exact HTTPS origin, regardless of proxy headers", () => {
  assert.doesNotThrow(() =>
    checkOrigin(request("https://shop.example"), production),
  );
  for (const origin of [
    "http://shop.example",
    "https://evil.example",
    "ftp://shop.example",
    "null",
  ])
    assert.throws(() => checkOrigin(request(origin), production));
});

test("preview-only TLS proxy compatibility still rejects foreign and non-web origins", () => {
  assert.doesNotThrow(() =>
    checkOrigin(request("https://shop.example"), preview),
  );
  for (const origin of ["https://evil.example", "ftp://shop.example", "null"])
    assert.throws(() => checkOrigin(request(origin), preview));
});

test("pagination retains PostgreSQL microseconds instead of rounding through Date", () => {
  const precise = "2026-09-08T08:00:00.123456";
  const cursor = nextCursor({
    id: "12345678-1234-1234-1234-123456789abc",
    cursorDate: precise,
  });
  const result = pageOptions(new URL(`http://localhost?cursor=${cursor}`));
  assert.equal(result.cursor?.date, precise);
});
