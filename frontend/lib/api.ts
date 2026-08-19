/**
 * Minimal API client. Calls the backend directly (not through Next's dev
 * proxy — that proxy resets the connection on slow requests like OCR
 * uploads). The backend's CORS config already allows this origin.
 */

import { supabase } from "./supabaseClient";

// Reachable from the browser whether the backend is running via Docker
// (port published to the host) or bare-metal (same machine, same port).
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Gemini's API typically responds in a few seconds. Generous timeout still
// covers slow connections / a cold Gemini request without making the user
// wait two minutes to find out something's actually wrong.
const UPLOAD_TIMEOUT_MS = 45_000;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const isUpload = isFormData;

  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new Error("Not signed in");
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    isUpload ? UPLOAD_TIMEOUT_MS : 15_000
  );

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        Authorization: `Bearer ${accessToken}`,
        ...(options.headers || {}),
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Request failed (${res.status}): ${text}`);
    }

    if (res.status === 204) return undefined as T;
    return res.json();
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Request timed out reaching Gemini. Try again in a moment.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Turns the relative "/uploads/..." path the backend returns into an absolute URL. */
export function imageUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  return path.startsWith("http") ? path : `${API_BASE}${path}`;
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown, options: RequestInit = {}) =>
    request<T>(path, {
      method: "POST",
      body: body instanceof FormData ? body : JSON.stringify(body),
      ...options,
    }),
  patch: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T,>(path: string) => request<T>(path, { method: "DELETE" }),

  /** For endpoints that return a file (e.g. PDF reports) instead of JSON. */
  async postForBlob(path: string): Promise<Blob> {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) throw new Error("Not signed in");

    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Request failed (${res.status}): ${text}`);
    }

    return res.blob();
  },
};
