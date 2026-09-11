"use client";

import { useEffect } from "react";

export function RegisterSW() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    // Register after load so it never competes with the initial page load
    // for bandwidth/CPU on slow connections.
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Non-fatal — the app works fine without offline support.
      });
    });
  }, []);

  return null;
}
