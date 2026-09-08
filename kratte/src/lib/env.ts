type Environment = Record<string, string | undefined>;

export function parseServerEnv(source: Environment) {
  const mode = source.APP_MODE || "preview";
  if (!["preview", "production", "test"].includes(mode))
    throw new Error("APP_MODE must be preview, production, or test.");
  const production = mode === "production";
  function flag(key: string, fallback: boolean) {
    const value = source[key];
    if (!value) return fallback;
    if (!["true", "false"].includes(value))
      throw new Error(`${key} must be true or false.`);
    return value === "true";
  }
  function integer(key: string, fallback: number, min: number, max: number) {
    const value = source[key] === undefined ? fallback : Number(source[key]);
    if (!Number.isInteger(value) || value < min || value > max)
      throw new Error(`${key} must be an integer between ${min} and ${max}.`);
    return value;
  }
  function origin(value: string, label: string) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`${label} must be an absolute origin.`);
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new Error(`${label} must contain only a protocol and host.`);
    if (production && url.protocol !== "https:")
      throw new Error(`${label} must use HTTPS in production mode.`);
    return url.origin;
  }
  const appOrigin = source.APP_ORIGIN
    ? origin(source.APP_ORIGIN, "APP_ORIGIN")
    : undefined;
  if (production && !appOrigin)
    throw new Error("APP_ORIGIN is required when APP_MODE=production.");
  const securitySecret = source.SECURITY_SECRET;
  if (
    (securitySecret && Buffer.byteLength(securitySecret) < 32) ||
    (production && !securitySecret)
  )
    throw new Error(
      "SECURITY_SECRET must contain at least 32 bytes in production mode.",
    );
  const frameOrigins = (source.ALLOWED_FRAME_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => origin(value, "ALLOWED_FRAME_ORIGINS"));
  const embedded = flag("EMBEDDED_PREVIEW", !production);
  if (production && embedded && !frameOrigins.length)
    throw new Error("ALLOWED_FRAME_ORIGINS is required for production embeds.");
  return Object.freeze({
    mode,
    production,
    appOrigin,
    securitySecret,
    frameOrigins,
    embedded,
    trustProxy: flag("TRUST_PROXY", !production),
    proxyHops: integer("TRUST_PROXY_HOPS", 1, 1, 10),
    demoEnabled: flag("ALLOW_DEMO_WORKSPACES", !production),
    seedNewAccounts: flag("SEED_NEW_ACCOUNTS", !production),
    signupEnabled: flag("ALLOW_SIGNUP", true),
    databaseSsl: flag("DATABASE_SSL", production),
    databaseCa: source.DATABASE_CA_CERT?.replaceAll("\\n", "\n"),
    poolMax: integer("DATABASE_POOL_MAX", 10, 1, 100),
    connectionTimeoutMs: integer(
      "DATABASE_CONNECT_TIMEOUT_MS",
      5000,
      500,
      30000,
    ),
    statementTimeoutMs: integer(
      "DATABASE_STATEMENT_TIMEOUT_MS",
      10000,
      1000,
      120000,
    ),
    sessionDays: integer("SESSION_TTL_DAYS", 14, 1, 30),
    maxSessions: integer("MAX_SESSIONS_PER_ACCOUNT", 10, 1, 50),
    snapshotLimit: integer("WORKSPACE_SNAPSHOT_LIMIT", 10000, 100, 50000),
    logLevel:
      source.LOG_LEVEL === "silent" && !production
        ? "silent"
        : source.LOG_LEVEL === "debug"
          ? "debug"
          : "info",
  });
}
let cached: ReturnType<typeof parseServerEnv> | undefined;
export function serverEnv() {
  return (cached ??= parseServerEnv(process.env));
}
