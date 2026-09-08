import { serverEnv } from "@/lib/env";
import { HttpError } from "@/lib/http-error";

export function checkOrigin(request: Request, config = serverEnv()) {
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site")
    throw new HttpError(
      "Cross-site requests are not permitted.",
      403,
      "INVALID_ORIGIN",
    );
  const origin = request.headers.get("origin");
  if (!origin) return; // Non-browser JSON clients are allowed; HTML/form bodies are rejected separately.
  let actual: string;
  try {
    const parsed = new URL(origin);
    if (
      parsed.origin === "null" ||
      !["http:", "https:"].includes(parsed.protocol)
    )
      throw new Error();
    actual = parsed.origin;
  } catch {
    throw new HttpError(
      "This request origin is not permitted.",
      403,
      "INVALID_ORIGIN",
    );
  }
  let expected = config.appOrigin;
  if (!expected) {
    const url = new URL(request.url);
    const host = config.trustProxy
      ? request.headers.get("x-forwarded-host")?.split(",")[0].trim() ||
        request.headers.get("host") ||
        url.host
      : url.host;
    const protocol = config.trustProxy
      ? request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ||
        url.protocol.replace(":", "")
      : url.protocol.replace(":", "");
    try {
      expected = new URL(`${protocol}://${host}`).origin;
    } catch {
      throw new HttpError("Invalid request host.", 403, "INVALID_ORIGIN");
    }
  }
  // The managed preview terminates TLS before forwarding to Next.js. Never use
  // this host-only compatibility branch for a configured production origin.
  const previewProxyMatch =
    !config.production &&
    !config.appOrigin &&
    config.trustProxy &&
    new URL(actual).host === new URL(expected).host;
  if (actual !== expected && !previewProxyMatch)
    throw new HttpError(
      "This request origin is not permitted.",
      403,
      "INVALID_ORIGIN",
    );
}
