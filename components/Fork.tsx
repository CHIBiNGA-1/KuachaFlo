"use client";

import { useState } from "react";
import { supabase, type ServiceChoice } from "@/lib/supabase";

const SERVICES: {
  id: ServiceChoice;
  icon: string;
  name: string;
  tagline: string;
  points: string[];
}[] = [
  {
    id: "personal",
    icon: "◌",
    name: "Personal",
    tagline: "Your money, handled.",
    points: ["Snap receipts, auto-filed", "MoMo alerts land themselves", "Reports for tax & loans"],
  },
  {
    id: "shop",
    icon: "⬣",
    name: "Shop",
    tagline: "Your business, in your pocket.",
    points: ["Inventory & stock alerts", "Sales, customers, suppliers", "Day sheets via WhatsApp"],
  },
];

export function Fork({
  userId,
  onLocked,
  onSignOut,
}: {
  userId: string;
  onLocked: (choice: ServiceChoice) => void;
  onSignOut: () => void;
}) {
  const [picked, setPicked] = useState<ServiceChoice | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const service = SERVICES.find((s) => s.id === picked);

  async function lock() {
    if (!supabase || !picked) return;
    setBusy(true);
    setError(null);
    try {
      // Upsert: creates the row, or sets the choice if still null.
      // RLS blocks changing an already-set choice — the lock is in the
      // database, not just the UI.
      const { error } = await supabase.from("profiles").upsert(
        { id: userId, service_choice: picked, chosen_at: new Date().toISOString() },
        { onConflict: "id" }
      );
      if (error) throw error;
      // Read back the truth — if a choice was already locked, that's what we honor.
      const { data, error: readError } = await supabase
        .from("profiles")
        .select("service_choice")
        .eq("id", userId)
        .single();
      if (readError) throw readError;
      onLocked((data?.service_choice as ServiceChoice) ?? picked);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't lock your choice — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-5 pb-16 pt-14">
      <div className="text-center">
        <div className="kicker">The fork</div>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
          One account. Two paths.
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Pick the service this account will serve.{" "}
          <strong className="text-ink">This choice is permanent — you can never come back
          to this screen or switch paths.</strong>
        </p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {SERVICES.map((s) => (
          <button
            key={s.id}
            onClick={() => { setPicked(s.id); setUnderstood(false); setError(null); }}
            className="card p-6 text-left transition-transform hover:-translate-y-0.5"
            style={picked === s.id ? { outline: "2px solid var(--ink)" } : undefined}
          >
            <div className="text-3xl">{s.icon}</div>
            <div className="mt-3 text-xl font-black">{s.name}</div>
            <div className="text-sm font-bold text-muted">{s.tagline}</div>
            <ul className="mt-4 flex flex-col gap-2">
              {s.points.map((p) => (
                <li key={p} className="flex gap-2 text-[13px] text-muted">
                  <span>✓</span> {p}
                </li>
              ))}
            </ul>
          </button>
        ))}
      </div>

      <div className="mt-6 text-center">
        <button
          className="btn btn-dark px-10"
          disabled={!picked}
          onClick={() => { setUnderstood(false); setError(null); setConfirming(true); }}
        >
          Continue with {service ? service.name : "…"}
        </button>
        <div>
          <button onClick={onSignOut} className="mt-4 text-xs font-bold text-muted underline">
            Sign out
          </button>
        </div>
      </div>

      {service && confirming && (
        <ConfirmLock
          serviceName={service.name}
          understood={understood}
          setUnderstood={setUnderstood}
          busy={busy}
          error={error}
          onCancel={() => { setConfirming(false); setUnderstood(false); }}
          onLock={lock}
        />
      )}
    </div>
  );
}

function ConfirmLock({
  serviceName,
  understood,
  setUnderstood,
  busy,
  error,
  onCancel,
  onLock,
}: {
  serviceName: string;
  understood: boolean;
  setUnderstood: (v: boolean) => void;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onLock: () => void;
}) {
  return (
    <div className="sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="sheet">
        <div className="kicker">Final step · No way back</div>
        <h3 className="mt-1 text-2xl font-black">Lock in {serviceName}?</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          This account will serve <strong className="text-ink">{serviceName}</strong> forever.
          You will never see this choice again and can never switch to the other service —
          not in settings, not by asking. A different service needs a different account.
        </p>
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl bg-paper p-3 text-[13px] font-semibold">
          <input
            type="checkbox"
            checked={understood}
            onChange={(e) => setUnderstood(e.target.checked)}
            className="mt-1 h-4 w-4"
          />
          I understand this is permanent and I can never change it.
        </label>
        {error && (
          <div className="mt-3 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-800">
            {error}
          </div>
        )}
        <div className="mt-5 flex gap-2">
          <button className="btn flex-1" onClick={onCancel} disabled={busy}>
            Go back
          </button>
          <button className="btn btn-lime flex-1" onClick={onLock} disabled={!understood || busy}>
            {busy ? "Locking…" : "Lock my choice"}
          </button>
        </div>
      </div>
    </div>
  );
}
