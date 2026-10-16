/**
 * Tiny native IndexedDB wrapper. No dependency — this is the entire
 * persistence layer for offline-first: two object stores.
 *
 *  - `cache`  — last-known-good server data, read instantly on load and
 *               refreshed from the network in the background. Keyed by a
 *               resource name ("products", "orders:sale", "overview", ...).
 *  - `outbox` — writes made while offline, replayed in order once the
 *               network is back. See engine.ts for how both are used.
 *
 * Every read/write here is best-effort: if IndexedDB is unavailable
 * (private browsing in some browsers, very old browsers) these quietly
 * resolve to "nothing cached" rather than throwing, so the app still
 * works online — it just loses offline resilience, never correctness.
 */

const DB_NAME = "kratte";
const DB_VERSION = 1;
const CACHE_STORE = "cache";
const OUTBOX_STORE = "outbox";

export type OutboxEntry = {
  id: string; // = idempotencyKey when we have one; else a generated uuid
  method: "POST" | "PATCH" | "DELETE";
  path: string;
  body: unknown;
  idempotencyKey?: string;
  createdAt: number;
  cacheKey: string;
  localId?: string; // set for POSTs that created an optimistic "local:" row
};

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      let req: IDBOpenDBRequest;
      try {
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch {
        resolve(null);
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(CACHE_STORE)) {
          db.createObjectStore(CACHE_STORE, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
          db.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }
  return dbPromise;
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  if (!db) return undefined;
  return new Promise((resolve) => {
    const t = db.transaction(CACHE_STORE, "readonly");
    const req = t.objectStore(CACHE_STORE).get(key);
    req.onsuccess = () => resolve(req.result ? (req.result.value as T) : undefined);
    req.onerror = () => resolve(undefined);
  });
}

export async function cacheSet<T>(key: string, value: T): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    const t = db.transaction(CACHE_STORE, "readwrite");
    t.objectStore(CACHE_STORE).put({ key, value, updatedAt: Date.now() });
    t.oncomplete = () => resolve();
    t.onerror = () => resolve();
    t.onabort = () => resolve();
  });
}

export async function outboxAdd(entry: OutboxEntry): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    const t = db.transaction(OUTBOX_STORE, "readwrite");
    t.objectStore(OUTBOX_STORE).put(entry);
    t.oncomplete = () => resolve();
    t.onerror = () => resolve();
    t.onabort = () => resolve();
  });
}

export async function outboxRemove(id: string): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    const t = db.transaction(OUTBOX_STORE, "readwrite");
    t.objectStore(OUTBOX_STORE).delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => resolve();
    t.onabort = () => resolve();
  });
}

export async function outboxAll(): Promise<OutboxEntry[]> {
  const db = await openDB();
  if (!db) return [];
  return new Promise((resolve) => {
    const t = db.transaction(OUTBOX_STORE, "readonly");
    const req = t.objectStore(OUTBOX_STORE).getAll();
    req.onsuccess = () => resolve((req.result as OutboxEntry[]) || []);
    req.onerror = () => resolve([]);
  });
}
