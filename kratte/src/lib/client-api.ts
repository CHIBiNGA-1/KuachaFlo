"use client";

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code = "NETWORK_ERROR",
    public requestId?: string,
    public retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function needsSession(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.status === 401 || error.code === "WORKSPACE_CHANGED")
  );
}

export async function api<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 20000);
  const externalAbort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", externalAbort, { once: true });
  try {
    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    if (options.body && !headers.has("Content-Type"))
      headers.set("Content-Type", "application/json");
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw new ApiError(
        response.ok
          ? "The server response was interrupted. Your form is still here; retrying the same save is safe."
          : "The service is temporarily unavailable. Please try again.",
        response.ok ? 0 : response.status,
        "INVALID_RESPONSE",
      );
    }
    if (!response.ok) {
      const body =
        result && typeof result === "object"
          ? (result as { error?: string; code?: string; requestId?: string })
          : {};
      throw new ApiError(
        body.error || "Something went wrong. Please try again.",
        response.status,
        body.code || "REQUEST_FAILED",
        body.requestId || response.headers.get("X-Request-ID") || undefined,
        Number(response.headers.get("Retry-After")) || undefined,
      );
    }
    return result as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (options.signal?.aborted)
      throw new ApiError("Request cancelled.", 0, "ABORTED");
    if (timedOut)
      throw new ApiError(
        "The connection timed out. Your form is still here; retrying the same save is safe.",
        0,
        "TIMEOUT",
      );
    if (!navigator.onLine)
      throw new ApiError(
        "You’re offline. Reconnect, then try again. Your open form hasn’t been cleared.",
        0,
        "OFFLINE",
      );
    throw new ApiError(
      "We couldn’t confirm the server response. Your form is still here; retrying the same save is safe.",
      0,
      "NETWORK_ERROR",
    );
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", externalAbort);
  }
}
