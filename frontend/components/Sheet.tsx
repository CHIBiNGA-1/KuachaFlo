"use client";

import { useEffect } from "react";

/** Shared bottom-sheet dialog: overlay-tap + ESC to close. */
export function Sheet({
  kicker,
  title,
  onClose,
  children,
  foot,
}: {
  kicker: string;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  foot?: string;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="sheet-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="kicker">{kicker}</div>
            <h3 className="mt-1 font-display text-[24px]">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg text-muted"
            style={{ background: "var(--bg)" }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="mt-4">{children}</div>
        <div className="mt-5 flex items-center justify-between gap-3">
          <small className="text-[11px] text-muted">{foot}</small>
          <button className="btn btn-dark" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}