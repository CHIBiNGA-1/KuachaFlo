"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

type Props = {
  children: (ctx: { session: Session; signOut: () => void }) => React.ReactNode;
};

export function AuthGate({ children }: Props) {
  const [session, setSession] = useState<Session | null | undefined>(undefined); // undefined = still loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div className="auth-loading">
        <div className="logo-mark">KF</div>
        <span>Loading KuachaFlo…</span>
      </div>
    );
  }

  if (session === null) {
    return <SignInScreen />;
  }

  return <>{children({ session, signOut: () => supabase.auth.signOut() })}</>;
}

const FEATURES = [
  { icon: "◎", label: "Snap a receipt, done in one call" },
  { icon: "▤", label: "Auto-categorized, no manual sorting" },
  { icon: "▥", label: "Export clean PDF & CSV reports" },
];

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.4 0 6.4 1.17 8.8 3.46l6.55-6.55C35.4 2.5 30.06 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.63 5.93C12.1 13.02 17.6 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.5 24.5c0-1.64-.15-3.22-.42-4.74H24v9h12.65c-.55 2.95-2.2 5.45-4.7 7.13l7.35 5.7C43.6 37.4 46.5 31.5 46.5 24.5z"/>
      <path fill="#FBBC05" d="M10.19 19.15A14.5 14.5 0 0 0 9.5 24c0 1.7.27 3.34.69 4.85l-7.63 5.93A23.94 23.94 0 0 1 0 24c0-3.87.93-7.52 2.56-10.78l7.63 5.93z"/>
      <path fill="#34A853" d="M24 48c6.06 0 11.15-2 14.87-5.44l-7.35-5.7c-2.04 1.4-4.66 2.24-7.52 2.24-6.4 0-11.9-3.52-13.81-8.65l-7.63 5.93C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

function SignInScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setInfo("Check your email to confirm your account, then sign in.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setGoogleBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setError(error.message);
      setGoogleBusy(false);
    }
    // On success the browser navigates away to Google, so no need to reset busy state.
  }

  return (
    <div className="auth">
      <div className="auth-story">
        <div className="auth-story-top">
          <div className="logo-mark">KF</div>
          <strong>KuachaFlo</strong>
        </div>

        <div className="auth-story-mid">
          <h1>Expense capture, without friction.</h1>
          <p>
            Point your camera at a receipt. KuachaFlo reads it, categorizes it,
            and files it — no typing, no spreadsheets, no missed write-offs.
          </p>
          <div className="auth-feature-list">
            {FEATURES.map((f) => (
              <div className="auth-feature" key={f.label}>
                <i>{f.icon}</i>
                {f.label}
              </div>
            ))}
          </div>
        </div>

        <div className="auth-story-foot">Built for individuals, teams, and everything in between.</div>
        <div className="auth-float-card" aria-hidden="true" />
      </div>

      <div className="auth-panel">
        <div className="auth-card">
          <div className="auth-card-head">
            <div className="logo-mark">KF</div>
            <h2>{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
            <p>
              {mode === "signin"
                ? "Sign in to pick up where you left off."
                : "Takes about 30 seconds. No card required."}
            </p>
          </div>

          <button type="button" className="auth-oauth-btn" onClick={handleGoogle} disabled={googleBusy}>
            <GoogleIcon />
            {googleBusy ? "Redirecting…" : "Continue with Google"}
          </button>

          <div className="auth-divider">
            <span />
            or use email
            <span />
          </div>

          <form onSubmit={handleEmailAuth}>
            {error && <div className="auth-msg err">{error}</div>}
            {info && <div className="auth-msg ok">{info}</div>}

            <div className="auth-field">
              <label htmlFor="auth-email">Email</label>
              <input
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="auth-field">
              <label htmlFor="auth-password">Password</label>
              <input
                id="auth-password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button type="submit" className="auth-submit" disabled={busy}>
              {busy && <span className="auth-spinner" />}
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="auth-switch">
            {mode === "signin" ? (
              <>No account? <button onClick={() => { setMode("signup"); setError(null); setInfo(null); }}>Sign up</button></>
            ) : (
              <>Already have one? <button onClick={() => { setMode("signin"); setError(null); setInfo(null); }}>Sign in</button></>
            )}
          </div>

          <div className="auth-terms">
            By continuing you agree to keep your receipts honest.
          </div>
        </div>
      </div>
    </div>
  );
}
