/**
 * The offline-first core. Every exported function in lib/shop.ts routes
 * through here instead of calling fetch() directly, so all of it gets the
 * same behavior for free:
 *
 *  - reads (`readThrough`) return the last-known-good cached value
 *    instantly when the network is unreachable, instead of throwing.
 *  - writes (`writeThrough`) apply optimistically to the local cache and
 *    queue themselves for replay when offline, instead of failing.
 *  - the queue replays in order once the network is back — silently, no
 *    user action required — reconciling optimistic local rows (temp
 *    "local:" ids) with whatever the server actually assigned, and
 *    rewriting any reference to those temp ids in later-queued requests
 *    (e.g. creating a product offline, then editing it before
 *    reconnecting) so causality is preserved.
 *  - a version conflict on replay (someone/something else touched the
 *    row first) gets one automatic retry against the fresh version;
 *    past that it's surfaced rather than silently dropped or silently
 *    overwritten.
 *
 * This file is deliberately resource-agnostic — it knows nothing about
 * products vs. orders vs. customers. lib/shop.ts supplies the shape.
 */

import { getAuthToken } from "@/lib/supabase";
import { cacheGet, cacheSet, outboxAdd, outboxAll, outboxRemove, type OutboxEntry } from "./db";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
const SYNC_EVENT = "kratte:sync";
const ID_MAP_KEY = "__local_id_map";
const FAILED_KEY = "__sync_failed";

export class ShopError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ── network status ──────────────────────────────────────────────────────

type Status = { online: boolean; pending: number; failed: number };
const listeners = new Set<(s: Status) => void>();
let currentlyOnline = true; // optimistic until the first ping says otherwise
let flushing = false;

function emitStatus() {
  outboxAll().then((all) => {
    const s: Status = { online: currentlyOnline, pending: all.length, failed: 0 };
    cacheGet<string[]>(FAILED_KEY).then((failed) => {
      s.failed = failed?.length || 0;
      listeners.forEach((cb) => cb(s));
    });
  });
}

export function onStatusChange(cb: (s: Status) => void): () => void {
  listeners.add(cb);
  emitStatus();
  return () => listeners.delete(cb);
}

function notifySync() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SYNC_EVENT));
  emitStatus();
}

export const SYNC_EVENT_NAME = SYNC_EVENT;

async function ping(timeoutMs = 4000): Promise<boolean> {
  if (!API_BASE) return false;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}/healthz`, { signal: controller.signal, cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

async function setOnline(next: boolean) {
  const was = currentlyOnline;
  currentlyOnline = next;
  if (next && !was) {
    await flushQueue();
  }
  emitStatus();
}

let started = false;
export function startNetworkWatch() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("online", () => ping().then(setOnline));
  window.addEventListener("offline", () => setOnline(false));
  // Browsers' online/offline events are unreliable on their own (a Wi-Fi
  // interface can report "up" with no real internet behind it), so a
  // periodic reachability check backstops them — cheap, unauthenticated,
  // and only matters while we're not confirmed online anyway.
  setInterval(() => {
    if (!currentlyOnline) ping().then(setOnline);
  }, 20000);
  ping().then(setOnline);
}

// ── low-level request ───────────────────────────────────────────────────

type NetworkResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "offline" }
  | { kind: "http"; status: number; code: string; message: string; body: unknown };

async function rawRequest<T>(path: string, init?: RequestInit): Promise<NetworkResult<T>> {
  if (!API_BASE) return { kind: "offline" };
  const token = await getAuthToken();
  if (!token) return { kind: "http", status: 401, code: "SIGNED_OUT", message: "Sign in first.", body: null };

  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
    });
  } catch {
    return { kind: "offline" };
  }

  if (res.status === 204) return { kind: "ok", data: undefined as T };
  if (!res.ok) {
    let message = `Request failed (${res.status}).`;
    let code = "REQUEST_FAILED";
    let body: unknown = null;
    try {
      body = await res.json();
      const b = body as Record<string, unknown>;
      if (typeof b?.error === "string" && b.error) message = b.error;
      else if (typeof b?.detail === "string" && b.detail) message = b.detail;
      if (typeof b?.code === "string" && b.code) code = b.code;
    } catch {
      /* keep the fallback */
    }
    return { kind: "http", status: res.status, code, message, body };
  }
  return { kind: "ok", data: (await res.json()) as T };
}

/** Direct, non-cached, non-queued request — throws ShopError on any
 * failure, network or HTTP. Used for actions that must not be queued
 * (e.g. sign-in-adjacent calls) and internally by readThrough/writeThrough. */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const result = await rawRequest<T>(path, init);
  if (result.kind === "ok") return result.data;
  if (result.kind === "offline") {
    throw new ShopError(0, "UNREACHABLE", "Couldn't reach the shop — check your connection and try again.");
  }
  throw new ShopError(result.status, result.code, result.message);
}

// ── reads ────────────────────────────────────────────────────────────────

/** GET with cache fallback: fresh data when reachable (and cached for next
 * time offline), last-known-good data when not. Only throws if there is
 * truly nothing to show — the very first load with no connection. */
export async function readThrough<T>(cacheKey: string, path: string, fallbackLabel: string): Promise<T> {
  const result = await rawRequest<T>(path);
  if (result.kind === "ok") {
    await cacheSet(cacheKey, result.data);
    if (!currentlyOnline) setOnline(true); // a successful call is proof enough
    return result.data;
  }
  if (result.kind === "offline") {
    if (currentlyOnline) setOnline(false);
    const cached = await cacheGet<T>(cacheKey);
    if (cached !== undefined) return cached;
    throw new ShopError(0, "UNREACHABLE", fallbackLabel);
  }
  throw new ShopError(result.status, result.code, result.message);
}

/** List read for `{ items: T[] }` endpoints. The list cache under
 * `listKey` is the source of truth the UI sees: it holds the last server
 * list plus any optimistic edits/creates still waiting in the queue.
 * Online, pending writes are flushed first so a refresh can never
 * overwrite work that hasn't reached the server yet. Offline, the
 * cached list (with those edits applied) is returned as-is. */
export async function readList<T extends { id: string }>(
  listKey: string,
  path: string,
  fallbackLabel: string
): Promise<T[]> {
  if (currentlyOnline && (await outboxAll()).length > 0) await flushQueue();
  const result = await rawRequest<{ items: T[] }>(path);
  if (result.kind === "ok") {
    if (!currentlyOnline) setOnline(true);
    const stillLocal = ((await cacheGet<T[]>(listKey)) || []).filter((r) => r.id.startsWith("local:"));
    const merged = [...stillLocal, ...result.data.items];
    await cacheSet(listKey, merged);
    return merged;
  }
  if (result.kind === "offline") {
    if (currentlyOnline) setOnline(false);
    const cached = await cacheGet<T[]>(listKey);
    if (cached !== undefined) return cached;
    throw new ShopError(0, "UNREACHABLE", fallbackLabel);
  }
  throw new ShopError(result.status, result.code, result.message);
}

// ── writes ───────────────────────────────────────────────────────────────

async function getIdMap(): Promise<Record<string, string>> {
  return (await cacheGet<Record<string, string>>(ID_MAP_KEY)) || {};
}

async function resolvePathLocalIds(path: string): Promise<string> {
  if (!path.includes("local:")) return path;
  const map = await getIdMap();
  let out = path;
  for (const [local, real] of Object.entries(map)) out = out.split(local).join(real);
  return out;
}

/** Replaces every "local:..." id this flush pass already knows the real
 * server id for, in both the path and the JSON body — so a request
 * queued against an optimistic row (e.g. "edit this product I just
 * created offline") still lands on the right row once that create has
 * synced earlier in the same pass. */
async function resolveLocalIds(entry: OutboxEntry): Promise<OutboxEntry> {
  const map = await getIdMap();
  if (Object.keys(map).length === 0) return entry;
  const rewrite = (s: string) => {
    let out = s;
    for (const [local, real] of Object.entries(map)) out = out.split(local).join(real);
    return out;
  };
  const path = rewrite(entry.path);
  const body = entry.body ? JSON.parse(rewrite(JSON.stringify(entry.body))) : entry.body;
  return { ...entry, path, body };
}

export type WriteOptions<T> = {
  path: string;
  method: "POST" | "PATCH" | "DELETE";
  body?: unknown;
  idempotencyKey?: string;
  cacheKey: string;
  /** Builds the value to show immediately and store in cache while the
   * real request is in flight / queued. For a POST this should include a
   * fresh `local:<id>` id; omit for DELETE (nothing to show). */
  optimistic?: () => T;
  /** Applies `value` into the cached list/object under `cacheKey`. */
  applyToCache: (value: T) => Promise<void> | void;
  /** Called once a *queued* write is finally confirmed by the server,
   * so the optimistic row can be reconciled (e.g. swap the temp id for
   * the real one). Not called for a write that succeeds immediately —
   * applyToCache already has the real server value in that case. */
  reconcile?: (serverValue: T) => Promise<void> | void;
  /** The optimistic row's local id, if this write created one — lets a
   * later DELETE of a still-unsynced row cancel the queue entirely
   * instead of sending a DELETE for an id the server never saw. */
  localId?: string;
};

export async function writeThrough<T>(opts: WriteOptions<T>): Promise<T> {
  const init: RequestInit = {
    method: opts.method,
    headers: {
      "Content-Type": "application/json",
      ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  };

  // DELETE of something that only ever existed locally: just erase it
  // from the queue (and cancel anything else queued against it) —
  // nothing to tell the server, since it was never told to begin with.
  if (opts.method === "DELETE" && opts.path.includes("local:")) {
    await cancelLocalEntity(opts.path);
    notifySync();
    return undefined as T;
  }

  // A write aimed at a row the server hasn't seen yet (temp "local:" id)
  // can't be sent as-is. If its create has already synced, address the
  // real id; otherwise queue it behind the create, in order.
  const resolvedPath = await resolvePathLocalIds(opts.path);
  const targetsUnsyncedRow = resolvedPath.includes("local:");
  const result: NetworkResult<T> = targetsUnsyncedRow
    ? { kind: "offline" }
    : await rawRequest<T>(resolvedPath, init);

  if (result.kind === "ok") {
    if (!currentlyOnline) setOnline(true);
    await opts.applyToCache(result.data);
    notifySync();
    return result.data;
  }

  if (result.kind === "http") {
    // A real answer from a reachable server — not an offline condition.
    // Let the caller see the actual validation/conflict error.
    throw new ShopError(result.status, result.code, result.message);
  }

  // Offline (or waiting on an unsynced create): apply optimistically,
  // queue for later, return immediately.
  if (!targetsUnsyncedRow && currentlyOnline) setOnline(false);
  if (!opts.optimistic) {
    throw new ShopError(0, "UNREACHABLE", "Couldn't reach the shop — check your connection and try again.");
  }
  const optimisticValue = opts.optimistic();
  await opts.applyToCache(optimisticValue);
  await outboxAdd({
    id: opts.idempotencyKey || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    method: opts.method,
    path: opts.path,
    body: opts.body,
    idempotencyKey: opts.idempotencyKey,
    createdAt: Date.now(),
    cacheKey: opts.cacheKey,
    localId: opts.localId,
  });
  // Stash the reconcile callback in memory, keyed by outbox id, so a
  // later successful flush (possibly after a page reload lost the
  // closure) can still reconcile if the page is still open; if the page
  // reloads before reconnecting, the optimistic row simply stays as the
  // source of truth until the next full readThrough overwrites it with
  // the server's real list — never lost, just reconciled a beat later.
  if (opts.reconcile) pendingReconcilers.set(opts.idempotencyKey || "", opts.reconcile as (v: unknown) => void);
  notifySync();
  return optimisticValue;
}

const pendingReconcilers = new Map<string, (v: unknown) => void>();

async function cancelLocalEntity(pathWithLocalId: string): Promise<void> {
  const match = pathWithLocalId.match(/local:[a-zA-Z0-9-]+/);
  const localId = match?.[0];
  if (!localId) return;
  const all = await outboxAll();
  for (const entry of all) {
    if (entry.localId === localId || entry.path.includes(localId) || JSON.stringify(entry.body || {}).includes(localId)) {
      await outboxRemove(entry.id);
    }
  }
}

// ── queue flush ──────────────────────────────────────────────────────────

export async function flushQueue(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    let entries = await outboxAll();
    entries.sort((a, b) => a.createdAt - b.createdAt);
    const failed: string[] = [];

    for (const raw of entries) {
      const entry = await resolveLocalIds(raw);
      const init: RequestInit = {
        method: entry.method,
        headers: {
          "Content-Type": "application/json",
          ...(entry.idempotencyKey ? { "Idempotency-Key": entry.idempotencyKey } : {}),
        },
        ...(entry.body !== undefined ? { body: JSON.stringify(entry.body) } : {}),
      };

      const result = await rawRequest<unknown>(entry.path, init);

      if (result.kind === "offline") {
        // Lost connection again mid-flush — stop here, the rest stay
        // queued in order for next time.
        currentlyOnline = false;
        break;
      }

      if (result.kind === "ok") {
        await outboxRemove(entry.id);
        if (entry.localId && result.data && typeof (result.data as { id?: string }).id === "string") {
          const map = await getIdMap();
          map[entry.localId] = (result.data as { id: string }).id;
          await cacheSet(ID_MAP_KEY, map);
        }
        const reconcile = pendingReconcilers.get(entry.idempotencyKey || "");
        if (reconcile) {
          await reconcile(result.data);
          pendingReconcilers.delete(entry.idempotencyKey || "");
        } else if (entry.localId) {
          // The closure was lost (page reloaded while queued): just drop
          // the temp row; the refresh that follows brings in the real one.
          const list = (await cacheGet<{ id: string }[]>(entry.cacheKey)) || [];
          await cacheSet(entry.cacheKey, list.filter((r) => r.id !== entry.localId));
        }
        continue;
      }

      // result.kind === "http": a real answer from the server. On a
      // version conflict the row changed elsewhere while this edit sat
      // in the queue. Blindly re-sending would overwrite that newer
      // state (stock counts especially), so the stale edit is dropped,
      // recorded as a sync failure for the UI to surface, and the next
      // refresh shows the server's truth.
      if (result.status === 409) {
        await outboxRemove(entry.id);
        failed.push(`${entry.method} ${entry.path}: ${result.message}`);
        continue;
      }
      if (result.status === 404 && entry.method === "DELETE") {
        // Already gone — the delete got what it wanted.
        await outboxRemove(entry.id);
        continue;
      }
      // Any other real error (validation, etc.) — don't retry forever;
      // surface it and move on so one bad entry can't block the rest.
      await outboxRemove(entry.id);
      failed.push(`${entry.method} ${entry.path}: ${result.message}`);
    }

    if (failed.length) {
      const existing = (await cacheGet<string[]>(FAILED_KEY)) || [];
      await cacheSet(FAILED_KEY, [...existing, ...failed].slice(-20));
    }
  } finally {
    flushing = false;
    notifySync();
  }
}

export async function clearSyncFailures(): Promise<void> {
  await cacheSet(FAILED_KEY, []);
  emitStatus();
}
