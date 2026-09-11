export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { serverEnv } = await import("@/lib/env");
    const { logEvent } = await import("@/lib/logger");
    const config = serverEnv();
    logEvent("info", "app.started", { mode: config.mode });
    if (!config.production)
      logEvent("warn", "app.preview_mode", { mode: config.mode });
  }
}
export async function onRequestError(error: { digest?: string }) {
  const { logEvent } = await import("@/lib/logger");
  logEvent("error", "app.render_failure", {
    code: error.digest || "RENDER_ERROR",
  });
}
