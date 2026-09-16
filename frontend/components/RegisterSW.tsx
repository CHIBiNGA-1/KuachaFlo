"use client";

import { useEffect } from "react";

/** Registers the service worker for PWA installability. Never blocks
 * rendering and never throws — a failed registration just means the
 * app runs as a normal tab instead of an installable app. */
export function RegisterSW() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* offline install just isn't available — the app still works */
      });
    });
  }, []);

  return null;
}
