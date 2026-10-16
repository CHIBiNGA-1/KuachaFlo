import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(url && key);

/** Null when env is missing — UI shows a setup hint instead of crashing. */
export const supabase: SupabaseClient | null =
  supabaseConfigured ? createClient(url!, key!) : null;

export type Profile = {
  id: string;
  email: string | null;
  plan: "free" | "pro" | "business";
};

// supabase-js's default localStorage key is `sb-<project-ref>-auth-token`,
// where the ref is the subdomain of the project URL. Used only as a
// last-resort read below — never written to directly.
const STORAGE_KEY = (() => {
  try {
    const ref = new URL(url || "").hostname.split(".")[0];
    return ref ? `sb-${ref}-auth-token` : null;
  } catch {
    return null;
  }
})();

/**
 * The access token for the current session, guarded against hanging.
 * `supabase.auth.getSession()` is normally instant (it reads the
 * persisted session), but if that session has expired it silently tries
 * a network refresh first — which, offline, can hang well past any
 * reasonable UI wait instead of failing fast. Race it against a short
 * timeout and fall back to the last persisted token directly from
 * localStorage: stale is fine for queuing a request to replay later;
 * never attaching a token at all is the only real failure.
 */
/**
 * The persisted session read straight from localStorage, no network
 * involved. Used only as the cold-start fallback when `getSession()`
 * doesn't resolve quickly (see `bootSession` below) — enough to render
 * the app shell and an email, while `getAuthToken()` governs what every
 * actual request uses.
 */
export function getPersistedSession(): { access_token: string; email: string | null } | null {
  if (!STORAGE_KEY || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const token = parsed?.access_token ?? parsed?.currentSession?.access_token;
    const email = parsed?.user?.email ?? parsed?.currentSession?.user?.email ?? null;
    if (!token) return null;
    return { access_token: token, email };
  } catch {
    return null;
  }
}

/**
 * Resolves the session for app boot, guarded the same way as
 * `getAuthToken()`: if the SDK's own `getSession()` hasn't resolved
 * within `timeoutMs` (it silently tries a network refresh when the
 * stored session looks expired, which hangs offline instead of failing
 * fast), fall back to the persisted session so a previously-signed-in
 * user still lands in the app instead of waiting forever on "Opening…".
 * `source` tells the caller whether this came from the SDK (fully
 * trustworthy) or the offline fallback (good enough to render; real
 * requests still go through `getAuthToken()`, which applies the same
 * fallback per-call).
 */
export async function bootSession(
  timeoutMs = 2500
): Promise<{ email: string; source: "sdk" | "cached" } | null> {
  if (!supabase) return null;
  const live = supabase.auth
    .getSession()
    .then((r) => (r.data.session ? { email: r.data.session.user.email ?? "", source: "sdk" as const } : null))
    .catch(() => null);
  const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), timeoutMs));
  const result = await Promise.race([live, timeout]);
  if (result && result !== "timeout") return result;
  if (result === null) return null; // the SDK resolved fast and said: no session
  const persisted = getPersistedSession();
  return persisted ? { email: persisted.email ?? "", source: "cached" } : null;
}

export async function getAuthToken(timeoutMs = 2500): Promise<string | null> {
  if (!supabase) return null;
  const live = supabase.auth
    .getSession()
    .then((r) => r.data.session?.access_token ?? null)
    .catch(() => null);
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  const token = await Promise.race([live, timeout]);
  if (token) return token;
  if (!STORAGE_KEY || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.access_token ?? parsed?.currentSession?.access_token ?? null;
  } catch {
    return null;
  }
}