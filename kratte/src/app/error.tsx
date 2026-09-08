"use client";
import { useEffect } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Workspace view failed", {
      reference: error.digest || "view-error",
    });
  }, [error.digest]);
  return (
    <main id="main-content" className="card workspace-error">
      <div className="empty-state">
        <div className="empty-icon">
          <ShieldCheck size={28} />
        </div>
        <h1>Let’s get your workspace back.</h1>
        <p>
          The view ran into a problem. Your saved records have not been deleted.
        </p>
        <button className="button button-primary" onClick={reset}>
          <RefreshCw size={16} />
          Try again
        </button>
        {error.digest && <p>Support reference: {error.digest}</p>}
      </div>
    </main>
  );
}
