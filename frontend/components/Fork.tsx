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
      // The RLS lock (service_choice must be null to update) rejects this
      // as a Postgres error if a choice was somehow already made — that's
      // the "never comes back" rule holding, not a bug to work around.
      setError("That choice couldn't be saved — it may already be locked in.");
      return;
    }
    onLocked(pending);
  }

  if (pending) {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <div className="w-full max-w-sm">
          <h2 className="mb-2 text-xl font-black">This is permanent</h2>
          <p className="mb-8 text-sm text-muted">
            You're choosing <strong className="text-ink">{pending === "personal" ? "Personal" : "Shop"}</strong>.
            This can never be changed for this account.
          </p>
          {error && <p className="mb-4 text-xs font-bold text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => setPending(null)}
              className="flex-1 rounded-xl border py-3 text-sm font-bold"
              style={{ borderColor: "var(--line)" }}
            >
              Go back
            </button>
            <button
              onClick={confirm}
              disabled={busy}
              className="flex-1 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: "var(--ink)" }}
            >
              {busy ? "…" : "Lock it in"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-md text-center">
        <h1 className="mb-2 text-2xl font-black tracking-tight">Pick your path</h1>
        <p className="mb-8 text-sm text-muted">
          One account, one path — choose once, it's permanent.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {(["personal", "shop"] as const).map((choice) => (
            <button
              key={choice}
              onClick={() => setPending(choice)}
              className="rounded-2xl border p-6 text-left transition hover:shadow-md"
              style={{ borderColor: "var(--line)" }}
            >
              <div className="mb-1 text-lg font-black">{choice === "personal" ? "Personal" : "Shop"}</div>
              <div className="text-xs text-muted">
                {choice === "personal"
                  ? "Track your own spending and receipts."
                  : "Run inventory, sales, and a shop."}
              </div>
            </button>
          ))}
        </div>
        <button onClick={onSignOut} className="mt-8 text-xs font-bold text-muted underline">
          Sign out
        </button>
      </div>
    </div>
  );
}
