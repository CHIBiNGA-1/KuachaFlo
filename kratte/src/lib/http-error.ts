import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { databaseErrorCode, logEvent } from "@/lib/logger";

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public retryAfter?: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
export class ValidationError extends HttpError {
  constructor(message: string) {
    super(message, 400, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}
export function errorResponse(
  error: unknown,
  fallback = "The service is temporarily unavailable. Please try again.",
  _defaultStatus = 503,
  requestId: string = randomUUID(),
) {
  let known = error instanceof HttpError ? error : undefined;
  const code = databaseErrorCode(error);
  if (!known && code === "23505")
    known = new HttpError(
      "A record with these unique details already exists.",
      409,
      "ALREADY_EXISTS",
    );
  if (!known && ["23514", "23502", "22P02", "22003"].includes(code || ""))
    known = new ValidationError(
      "These details do not meet the data requirements.",
    );
  if (!known && code === "23503")
    known = new HttpError(
      "This record is linked to other records. Review those links first.",
      409,
      "RELATED_RECORDS",
    );
  if (!known)
    logEvent("error", "api.failure", {
      requestId,
      code: code || "UNEXPECTED_ERROR",
    });
  const response = NextResponse.json(
    {
      error: known?.message || fallback,
      code: known?.code || "SERVER_ERROR",
      requestId,
    },
    { status: known?.status || 503 },
  );
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("X-Request-ID", requestId);
  if (known?.retryAfter)
    response.headers.set(
      "Retry-After",
      String(Math.max(1, Math.ceil(known.retryAfter))),
    );
  return response;
}
export async function withApi(
  request: Request,
  operation: string,
  handler: (context: { requestId: string }) => Promise<Response>,
): Promise<Response> {
  const incoming = request.headers.get("x-request-id") || "";
  const requestId = /^[a-f0-9-]{36}$/i.test(incoming) ? incoming : randomUUID();
  const started = performance.now();
  let response: Response;
  try {
    response = await handler({ requestId });
  } catch (error) {
    response = errorResponse(error, undefined, undefined, requestId);
  }
  response.headers.set("X-Request-ID", requestId);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("X-Content-Type-Options", "nosniff");
  const durationMs = Math.round(performance.now() - started);
  if (
    response.status >= 400 ||
    durationMs > 1000 ||
    process.env.LOG_LEVEL === "debug"
  )
    logEvent(
      response.status >= 500
        ? "error"
        : response.status >= 400
          ? "warn"
          : "info",
      "api.request",
      { requestId, operation, status: response.status, durationMs },
    );
  return response;
}
