import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";

export function proxy(request: NextRequest) {
  const config = serverEnv();
  const requestId = randomUUID();
  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);
  let csp: string | undefined;
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    const nonce = randomBytes(18).toString("base64");
    const development = process.env.NODE_ENV === "development";
    const ancestors = config.embedded
      ? config.frameOrigins.length
        ? `'self' ${config.frameOrigins.join(" ")}`
        : "'self' https: http://localhost:*"
      : "'self'";
    csp = [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
      // The board/charts use calculated style attributes; scripts remain nonce-restricted.
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' https: http: data: blob:",
      "font-src 'self'",
      `connect-src 'self'${development ? " ws: wss:" : ""}`,
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      `frame-ancestors ${ancestors}`,
      ...(config.production ? ["upgrade-insecure-requests"] : []),
    ].join("; ");
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", csp);
  }
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("X-Request-ID", requestId);
  if (config.production)
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  if (csp) {
    response.headers.set("Content-Security-Policy", csp);
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
  }
  return response;
}
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|images/|fonts/|icon.svg|favicon.ico).*)",
  ],
};
