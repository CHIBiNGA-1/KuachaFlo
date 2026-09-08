type LogFields = {
  requestId?: string;
  operation?: string;
  status?: number;
  durationMs?: number;
  code?: string;
  count?: number;
  mode?: string;
};

// An allowlist, not a blacklist: never serialize Request, Error, SQL, cookies, or user payloads.
export function logEvent(
  level: "info" | "warn" | "error",
  event: string,
  fields: LogFields = {},
) {
  if (
    process.env.LOG_LEVEL === "silent" &&
    process.env.APP_MODE !== "production"
  )
    return;
  const allowed: LogFields = {};
  for (const key of [
    "requestId",
    "operation",
    "status",
    "durationMs",
    "code",
    "count",
    "mode",
  ] as const) {
    const value = fields[key];
    if (value !== undefined)
      Object.assign(allowed, {
        [key]: typeof value === "string" ? value.slice(0, 120) : value,
      });
  }
  const message = JSON.stringify({
    time: new Date().toISOString(),
    level,
    event,
    ...allowed,
  });
  if (level === "error") console.error(message);
  else if (level === "warn") console.warn(message);
  else console.info(message);
}
export function databaseErrorCode(error: unknown): string | undefined {
  let current = error;
  for (
    let depth = 0;
    depth < 5 && current && typeof current === "object";
    depth++
  ) {
    const item = current as { code?: unknown; cause?: unknown };
    if (typeof item.code === "string" && /^[A-Z0-9_]{3,40}$/.test(item.code))
      return item.code;
    current = item.cause;
  }
  return undefined;
}
