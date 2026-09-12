"use client";

import { useState, type FormEvent } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";

export function Welcome({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");

    const { error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    onAuthed();
  }

  async function withGoogle() {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
    });
  }

  if (!supabaseConfigured) {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center text-sm text-muted">
        Supabase isn't configured yet — set NEXT_PUBLIC_SUPABASE_URL and
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-sm">
        <div
          className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-2xl text-xl font-black"
          style={{ background: "var(--ink)", color: "var(--accent)" }}
        >
          KF
        </div>
        <h1 className="mb-1 text-center text-2xl font-black tracking-tight">KuachaFlo</h1>
        <p className="mb-8 text-center text-sm text-muted">One account. Two paths.</p>

        <button
          onClick={withGoogle}
          className="mb-4 w-full rounded-xl border py-3 text-sm font-bold"
          style={{ borderColor: "var(--line)" }}
        >
          Continue with Google
        </button>

        <div className="mb-4 flex items-center gap-3 text-xs font-bold uppercase text-muted">
          <div className="h-px flex-1" style={{ background: "var(--line)" }} />
          or
          <div className="h-px flex-1" style={{ background: "var(--line)" }} />
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border px-4 py-3 text-sm"
            style={{ borderColor: "var(--line)" }}
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border px-4 py-3 text-sm"
            style={{ borderColor: "var(--line)" }}
          />
          {error && <p className="text-xs font-bold text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "var(--ink)" }}
          >
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-5 w-full text-center text-xs font-bold text-muted underline"
        >
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
