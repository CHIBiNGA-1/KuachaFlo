"use client";

import { useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";

export function Welcome({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<"in" | "up">("up");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError(null);
    setBusy(true);
    try {
      if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) {
          // Email confirmation is on — no session until they click the link.
          setNeedsConfirm(true);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
      onAuthed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    if (!supabase) return;
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) setError(error.message);
  }

  if (!supabaseConfigured) {
    return (
      <div className="card mx-auto mt-24 max-w-md p-8 text-center">
        <div className="kicker">Setup needed</div>
        <h1 className="mt-2 text-xl font-extrabold">Supabase isn&apos;t connected</h1>
        <p className="mt-2 text-sm text-muted">
          Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>, then reload.
        </p>
      </div>
    );
  }

  if (needsConfirm) {
    return (
      <div className="card mx-auto mt-24 max-w-md p-8 text-center">
        <div style={{ fontSize: 34 }}>✉️</div>
        <h1 className="mt-3 text-xl font-extrabold">Check your inbox</h1>
        <p className="mt-2 text-sm text-muted">
          We sent a confirmation link to <strong>{email}</strong>. Click it, then continue.
        </p>
        <button className="btn btn-dark mt-6 w-full" onClick={onAuthed}>
          I confirmed — continue
        </button>
        <button
          className="mt-3 text-xs font-bold text-muted underline"
          onClick={() => setNeedsConfirm(false)}
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-5 pb-16 pt-16">
      <div className="text-center">
        <div
          className="mx-auto grid h-14 w-14 place-items-center rounded-2xl text-xl font-black"
          style={{ background: "var(--ink)", color: "#d7f26d" }}
        >
          KF
        </div>
        <div className="kicker mt-5">One account · Two paths</div>
        <h1 className="mt-2 text-4xl font-black tracking-tight">KuachaFlo</h1>
        <p className="mt-2 text-sm text-muted">
          Your money, handled — personally, or for your whole shop. Choose your path once.
        </p>
      </div>

      <div className="card mt-8 p-6">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-paper p-1">
          {(["up", "in"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null); }}
              className={`rounded-lg py-2 text-sm font-extrabold ${
                mode === m ? "bg-ink text-white" : "text-muted"
              }`}
            >
              {m === "up" ? "Sign up" : "Log in"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
          <input
            className="field"
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            className="field"
            type="password"
            required
            minLength={6}
            placeholder="Password (6+ characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "up" ? "new-password" : "current-password"}
          />
          {error && (
            <div className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-800">
              {error}
            </div>
          )}
          <button className="btn btn-lime w-full" disabled={busy}>
            {busy ? "…" : mode === "up" ? "Create account" : "Log in"}
          </button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs font-bold text-muted">
          <span className="h-px flex-1 bg-line" /> or{" "}
          <span className="h-px flex-1 bg-line" />
        </div>

        <button className="btn w-full" onClick={google}>
          <span className="font-black">G</span> Continue with Google
        </button>
      </div>

      <p className="mt-5 text-center text-[11px] text-muted">
        After signing in you pick one of two services — permanently.
      </p>
    </div>
  );
}
