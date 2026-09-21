"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, supabaseConfigured } from "@/lib/supabase";

export function AuthScreen({ initialMode }: { initialMode: "up" | "in" }) {
  const router = useRouter();
  const [mode, setMode] = useState<"up" | "in">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/app");
    });
  }, [router]);

  function switchTo(m: "up" | "in") {
    setMode(m);
    setError(null);
    router.replace(m === "up" ? "/signup" : "/login");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError(null);
    if (mode === "up" && password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) {
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
      router.replace("/app");
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
      <div className="grid min-h-screen place-items-center bg-paper p-6">
        <div className="card max-w-sm p-8 text-center">
          <div className="kicker">Setup needed</div>
          <h1 className="mt-2 font-display text-2xl">Supabase isn&apos;t connected</h1>
          <p className="mt-2 text-sm text-muted">
            Set <code className="text-ink">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code className="text-ink">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>, then reload.
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-5 py-10">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col items-center gap-10 lg:flex-row lg:justify-center">
        {/* ── Left: brand + form ─────────────────────────────────────── */}
        <div className="w-full max-w-[420px]">
          <div className="mb-6 flex items-center gap-2.5">
            <div
              className="grid h-8 w-8 place-items-center rounded-full font-display text-[15px]"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              K
            </div>
            <span className="font-display text-[20px] font-semibold tracking-tight">KraTte</span>
          </div>

          <h1 className="font-display text-[2.4rem] font-medium leading-[1.1] tracking-tight text-ink">
            {mode === "up" ? (
              <>
                Run your shop
                <br />
                with clarity
              </>
            ) : (
              <>
                Good to
                <br />
                see you again
              </>
            )}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            {mode === "up"
              ? "Inventory, orders, and daily operations in one calm workspace."
              : "Pick up right where you left off — your shop is exactly as you left it."}
          </p>

          {needsConfirm ? (
            <div className="card mt-8 p-6 text-center">
              <div className="kicker">One more step</div>
              <h2 className="mt-2 font-display text-xl">Check your inbox</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                We sent a confirmation link to <strong className="text-ink">{email}</strong>. Click
                it, then come back and log in.
              </p>
              <button className="btn btn-accent mt-5 w-full" onClick={() => switchTo("in")}>
                Back to log in
              </button>
            </div>
          ) : (
            <div className="card mt-8 p-8">
              <button type="button" className="btn w-full" onClick={google}>
                <GoogleMark />
                Continue with Google
              </button>

              <div className="my-5 flex items-center gap-3 text-[11px] font-bold uppercase tracking-wide text-muted">
                <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
              </div>

              <form onSubmit={submit} className="flex flex-col gap-3.5">
                <input
                  className="field"
                  type="email"
                  required
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
                <div className="relative">
                  <input
                    className="field pr-16"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "up" ? "new-password" : "current-password"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] font-semibold"
                    style={{ color: "var(--accent)" }}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                {mode === "up" && (
                  <input
                    className="field"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    placeholder="Confirm your password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                  />
                )}

                {error && (
                  <div className="rounded-xl p-3 text-xs font-semibold" style={{ background: "var(--accent-wash)", color: "var(--red)" }}>
                    {error}
                  </div>
                )}

                <button className="btn btn-accent mt-1 w-full" disabled={busy}>
                  {busy ? "…" : mode === "up" ? "Create account" : "Log in"}
                </button>
              </form>

              <p className="mt-5 text-center text-[11px] leading-relaxed text-muted">
                By continuing, you agree to KraTte&apos;s{" "}
                <Link href="/terms" style={{ color: "var(--ink)" }} className="underline">
                  Terms
                </Link>{" "}
                and acknowledge the{" "}
                <Link href="/privacy" style={{ color: "var(--ink)" }} className="underline">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          )}

          {!needsConfirm && (
            <p className="mt-5 text-center text-[13px] text-muted">
              {mode === "up" ? "Already have an account? " : "New to KraTte? "}
              <button
                type="button"
                onClick={() => switchTo(mode === "up" ? "in" : "up")}
                className="font-semibold underline"
                style={{ color: "var(--accent)" }}
              >
                {mode === "up" ? "Log in" : "Create account"}
              </button>
            </p>
          )}
        </div>

        {/* ── Right: brand panel ─────────────────────────────────────── */}
        <div
          className="hidden h-[560px] w-[420px] shrink-0 rounded-lg2 lg:block"
          style={{
            background:
              "linear-gradient(165deg, var(--accent-wash) 0%, var(--surface-2) 55%, var(--ink) 130%)",
            boxShadow: "var(--shadow-pop)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <svg
            className="absolute inset-0 h-full w-full opacity-[0.15]"
            viewBox="0 0 420 560"
            preserveAspectRatio="none"
          >
            <circle cx="80" cy="90" r="120" fill="var(--accent)" />
            <circle cx="360" cy="440" r="160" fill="var(--ink)" />
          </svg>
          <div className="absolute bottom-8 right-8 max-w-[190px] text-right">
            <p className="font-display text-[1.3rem] leading-snug text-white" style={{ textShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>
              Make room for better questions.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.5 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.2 5.2C40.5 36.4 44 30.8 44 24c0-1.3-.1-2.7-.4-3.5z" />
    </svg>
  );
}
