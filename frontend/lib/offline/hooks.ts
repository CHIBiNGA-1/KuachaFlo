"use client";

import { useEffect, useState } from "react";
import { SYNC_EVENT_NAME, onStatusChange, startNetworkWatch } from "./engine";

/** Re-runs `load` whenever the offline queue finishes syncing, so a tab
 * that was showing optimistic data quietly swaps to the server's truth —
 * no spinner, no reload, no action from the user. */
export function useResync(load: () => void) {
  useEffect(() => {
    const handler = () => load();
    window.addEventListener(SYNC_EVENT_NAME, handler);
    return () => window.removeEventListener(SYNC_EVENT_NAME, handler);
  }, [load]);
}

export type SyncStatus = { online: boolean; pending: number; failed: number };

/** Live connection / queue state for the small status pill. Also starts
 * the network watcher (idempotent) the first time anything mounts it. */
export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>({ online: true, pending: 0, failed: 0 });
  useEffect(() => {
    startNetworkWatch();
    return onStatusChange(setStatus);
  }, []);
  return status;
}
