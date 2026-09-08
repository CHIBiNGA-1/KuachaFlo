"use client";
import { CloudOff, LockKeyhole, RefreshCw } from "lucide-react";
import { useShop } from "@/components/shop-provider";

export function SyncNotice() {
  const { data, syncState, error, refresh, reconnect } = useShop();
  if (!data || syncState === "ready" || syncState === "syncing") return null;
  const session = syncState === "session-expired";
  return (
    <div
      className={`sync-notice ${session ? "session-notice" : ""}`}
      role="status"
    >
      <span className="sync-notice-icon">
        {session ? <LockKeyhole size={20} /> : <CloudOff size={20} />}
      </span>
      <div>
        <strong>
          {session
            ? "Reconnect to keep working"
            : syncState === "offline"
              ? "You’re offline"
              : "Your latest view couldn’t be refreshed"}
        </strong>
        <p>
          {session
            ? "Sign in to the same account. Your open form and saved records stay in place."
            : syncState === "offline"
              ? "Your current view is still available. Reconnect before making changes."
              : "Confirmed saves are safe. Refresh to bring this view up to date."}
        </p>
        <span className="sr-only">{error}</span>
      </div>
      <button
        className="button button-small"
        onClick={session ? reconnect : () => void refresh().catch(() => {})}
      >
        {session ? <LockKeyhole size={14} /> : <RefreshCw size={14} />}{" "}
        {session ? "Sign in again" : "Retry sync"}
      </button>
    </div>
  );
}
