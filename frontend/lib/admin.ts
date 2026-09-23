/**
 * Client for /api/v1/admin/*.
 *
 * Deliberately separate from lib/shop.ts: shop calls authenticate with a
 * Supabase user's Bearer token, admin calls authenticate with a single
 * shared secret (X-Admin-Key) that every shop user's token must NOT be
 * able to reach. Keeping two files makes that boundary something you'd
 * have to actively cross, not something a shared helper quietly blurs.
 *
 * The key is never read from process.env — a NEXT_PUBLIC_* var is baked
 * into the JS bundle and shipped to every visitor's browser, which for a
 * key that can grant paid plans is not a "misconfiguration," it's a
 * breach. Instead the operator types it into the gate on /admin once; it
 * lives only in sessionStorage (cleared when the tab closes) and in
 * memory, and this file is the only thing that ever attaches it to a
 * request.
 */

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
const STORAGE_KEY = "kratte-admin-key";

export class AdminError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type AdminUser = {
  id: string;
  email: string | null;
  plan: "free" | "pro" | "business";
  entry_count: number;
};

export type PaymentRequest = {
  id: string;
  user_id: string;
  user_email: string;
  plan_requested: string;
  amount: number;
  currency: string;
  momo_network: string;
  momo_reference: string;
  momo_sender_number: string | null;
  status: "pending" | "confirmed" | "rejected";
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
};

// ── Key storage — sessionStorage only, and only in the browser ──────────

export function getStoredAdminKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) || "";
  } catch {
    // Private-browsing modes can throw on storage access — fail to
    // "not signed in" rather than crash the page.
    return "";
  }
}

export function storeAdminKey(key: string): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, key);
  } catch {
    /* if storage is unavailable the key still works for this page load,
       held in the caller's React state — it just won't survive a reload */
  }
}

export function clearStoredAdminKey(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clean up if storage was never available */
  }
}

// ── Requests ──────────────────────────────────────────────────────────

async function admin<T>(path: string, key: string, init?: RequestInit): Promise<T> {
  if (!API_BASE) {
    throw new AdminError(0, "NEXT_PUBLIC_API_URL isn't set in this build.");
  }
  if (!key) {
    throw new AdminError(401, "Enter the admin key first.");
  }

  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      ...init,
      headers: {
        "X-Admin-Key": key,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers || {}),
      },
    });
  } catch {
    throw new AdminError(0, "Couldn't reach the server — check your connection.");
  }

  if (res.status === 401) {
    // A previously-good key can go stale if it's rotated on the server —
    // don't keep offering a key that no longer works.
    clearStoredAdminKey();
    throw new AdminError(401, "That key was rejected — it may have been rotated. Enter the current one.");
  }
  if (res.status === 503) {
    throw new AdminError(503, "The admin API isn't configured on the server yet.");
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status}).`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      /* keep the generic message */
    }
    throw new AdminError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Doubles as the "is this key valid" check the gate uses. */
export function listUsers(key: string): Promise<AdminUser[]> {
  return admin<AdminUser[]>("/api/v1/admin/users", key);
}

export function setUserPlan(
  key: string,
  userId: string,
  plan: "free" | "pro" | "business"
): Promise<AdminUser> {
  return admin<AdminUser>(`/api/v1/admin/users/${userId}/plan`, key, {
    method: "PATCH",
    body: JSON.stringify({ plan }),
  });
}

export function listPaymentRequests(key: string, status?: string): Promise<PaymentRequest[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return admin<PaymentRequest[]>(`/api/v1/admin/payment-requests${qs}`, key);
}

export function reviewPaymentRequest(
  key: string,
  requestId: string,
  action: "confirm" | "reject",
  reviewNote?: string
): Promise<PaymentRequest> {
  return admin<PaymentRequest>(`/api/v1/admin/payment-requests/${requestId}`, key, {
    method: "PATCH",
    body: JSON.stringify({ action, review_note: reviewNote || undefined }),
  });
}
