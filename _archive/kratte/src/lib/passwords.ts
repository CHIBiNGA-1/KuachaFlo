import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { HttpError } from "@/lib/http-error";

// OWASP's scrypt N=2^17,r=8,p=1 profile. Two concurrent workers bound memory to ~256 MiB.
const COST = 131072;
const BLOCK_SIZE = 8;
const KEY_LENGTH = 64;
const MAX_CONCURRENT = 2;
const MAX_QUEUE = 16;
let active = 0;
const waiting: (() => void)[] = [];
async function acquire() {
  if (active < MAX_CONCURRENT) {
    active++;
    return;
  }
  if (waiting.length >= MAX_QUEUE)
    throw new HttpError(
      "Sign-in is busy. Please retry shortly.",
      503,
      "AUTH_BUSY",
      5,
    );
  await new Promise<void>((resolve) => waiting.push(resolve));
}
function release() {
  const next = waiting.shift();
  if (next) next();
  else active--;
}
async function derive(password: string, salt: string, cost = COST) {
  await acquire();
  try {
    return await new Promise<Buffer>((resolve, reject) =>
      scrypt(
        password,
        salt,
        KEY_LENGTH,
        { N: cost, r: BLOCK_SIZE, p: 1, maxmem: 160 * 1024 * 1024 },
        (error, key) => (error ? reject(error) : resolve(key)),
      ),
    );
  } finally {
    release();
  }
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$v1$${salt}$${(await derive(password, salt)).toString("hex")}`;
}
export function isLegacyPasswordHash(hash: string) {
  return /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash);
}
export async function verifyPassword(
  password: string,
  hash: string | null | undefined,
) {
  const current = /^scrypt\$v1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(
    hash || "",
  );
  const legacy = isLegacyPasswordHash(hash || "")
    ? (hash as string).split(":")
    : undefined;
  if (!current && !legacy) {
    // Unknown accounts still incur the same KDF work; never compare just a fast digest.
    await derive(password, randomBytes(16).toString("hex"));
    return false;
  }
  const salt = current?.[1] || legacy![0];
  const expected = Buffer.from(current?.[2] || legacy![1], "hex");
  const actual = await derive(password, salt, legacy ? 16384 : COST);
  return timingSafeEqual(actual, expected);
}
