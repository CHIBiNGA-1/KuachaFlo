"use client";

import { useState } from "react";
import { supabase, type ServiceChoice } from "@/lib/supabase";

export function Fork({
  userId,
  onLocked,
  onSignOut,
}: {
  userId: string;
  onLocked: (choice: ServiceChoice) => void;
  onSignOut: () => void;
}) {
  const [pending, setPending] = useState<ServiceChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    if (!pending || !supabase) return;
    setBusy(true);
    setError("");

    const { error } = await supabase.from("profiles").upsert(
      { id: userId, service_choice: pending, chosen_at: new Date().toISOString() },
      { onConflict: "id" },
    );

    setBusy(false);
    if (error) {
      setError("That choice couldn't be saved — it may already be locked in.");
      return;
    }
    onLocked(pending);
  }

  if (pending) {
    return (
      <div className="grid min-h-screen place-items-center px-6 py-12">
        <div className="w-full max-w-sm text-center">
          <div className="card glass p-8">
            <div className="kicker mb-3">This is permanent</div>
            <h2 className="mb-3 text-2xl font-black tracking-tight">
              {pending === "personal" ? "Personal" : "Shop"}, forever
            </h2>
            <p className="mb-7 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
              This account can never switch paths after this. If you&apos;re not
              sure, go back — there&apos;s no rush.
            </p>
            {error && (
              <p className="mb-4 rounded-lg px-3 py-2 text-xs font-bold" style={{ background: "var(--danger)", color: "var(--danger-ink)" }}>
                {error}
              </p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setPending(null)} className="btn secondary flex-1">
                Go back
              </button>
              <button onClick={confirm} disabled={busy} className="btn primary flex-1">
                {busy ? "…" : "Lock it in"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center px-6 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-9 text-center">
          <div className="logo-mark mx-auto mb-5 h-12 w-12 text-lg">KF</div>
          <h1 className="mb-2 text-[26px] font-black tracking-tight">Pick your path</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            One account, one path — choose once, it&apos;s permanent.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              { id: "personal" as const, title: "Personal", blurb: "Track your own spending and receipts.", icon: "🧾" },
              { id: "shop" as const, title: "Shop", blurb: "Run inventory, sales, and a shop.", icon: "🏪" },
            ]
          ).map((opt) => (
            <button
              key={opt.id}
              onClick={() => setPending(opt.id)}
              className="card group p-6 text-left transition-all hover:-translate-y-0.5"
              style={{ boxShadow: "var(--shadow-soft)" }}
            >
              <div
                className="mb-4 grid h-11 w-11 place-items-center rounded-xl text-lg"
                style={{ background: "var(--surface-2)" }}
              >
                {opt.icon}
              </div>
              <div className="mb-1 text-lg font-black tracking-tight">{opt.title}</div>
              <div className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                {opt.blurb}
              </div>
              <div
                className="mt-4 text-xs font-bold opacity-0 transition-opacity group-hover:opacity-100"
                style={{ color: "var(--accent-ink)" }}
              >
                Choose {opt.title} →
              </div>
            </button>
          ))}
        </div>

        <button onClick={onSignOut} className="btn ghost mx-auto mt-9 block">
          Sign out
        </button>
      </div>
    </div>
  );
}
