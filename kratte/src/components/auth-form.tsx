"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { navigateFresh } from "@/lib/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Quote,
  TrendingUp,
  ShoppingBag,
  Package,
} from "lucide-react";
import { api, ApiError } from "@/lib/client-api";
import type { Profile } from "@/lib/types";
import { Avatar, Logo, Spinner } from "@/components/ui";
export function AuthForm({ initialMode = "login" }: { initialMode?: string }) {
  const [mode, setMode] = useState(
    initialMode === "register" ? "register" : "login",
  );
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cookieBlocked, setCookieBlocked] = useState(false);
  const confirmSession = async (expectedId?: string) => {
    const result = await api<{ user: Profile | null }>("/api/auth");
    if (!result.user || (expectedId && result.user.id !== expectedId)) {
      setCookieBlocked(true);
      throw new ApiError(
        "Your browser isn’t retaining the secure session in this preview. Open KraTte in a new tab and sign in there.",
        401,
        "COOKIES_BLOCKED",
      );
    }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setCookieBlocked(false);
    setBusy(true);
    const values = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    let registered = false;
    try {
      const result = await api<{ user: Profile }>("/api/auth", {
        method: "POST",
        body: JSON.stringify({ ...values, action: mode }),
      });
      registered = mode === "register";
      await confirmSession(result.user.id);
      navigateFresh("/");
    } catch (failure) {
      const message =
        failure instanceof Error
          ? failure.message
          : "We couldn’t complete that. Please try again.";
      setError(registered ? `Your account was created. ${message}` : message);
    } finally {
      setBusy(false);
    }
  };
  const startDemo = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setCookieBlocked(false);
    try {
      await api("/api/workspace", {
        method: "POST",
        body: JSON.stringify({ action: "start-demo" }),
      });
      await confirmSession();
      navigateFresh("/");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "We couldn’t open the demo. Please try again.",
      );
      setBusy(false);
    }
  };
  return (
    <main className="auth-page" id="main-content">
      <section className="auth-story">
        <Link href="/" aria-label="KraTte home">
          <Logo />
        </Link>
        <div className="auth-story-content">
          <span className="auth-eyebrow">
            <Sparkles size={16} />
            GOOD BUSINESS STARTS HERE
          </span>
          <h1>
            A little clarity.
            <br />A world of
            <br />
            <span>possibility.</span>
          </h1>
          <p>
            Your shelves, your sales, your people.
            <br />
            Finally, all in a good place.
          </p>
          <div className="auth-store-illustration">
            <div className="illustration-circle circle-one" />
            <div className="illustration-circle circle-two" />
            <div className="auth-metric-card">
              <span>
                <TrendingUp size={17} />
                Business is growing
              </span>
              <strong>One good day at a time.</strong>
              <svg viewBox="0 0 250 75" aria-hidden="true">
                <path
                  d="M0 65 22 58 44 62 66 44 88 49 110 29 132 35 154 20 176 27 198 9 224 15 248 0V75H0Z"
                  fill="#e7f2e8"
                />
                <path
                  d="m0 65 22-7 22 4 22-18 22 5 22-20 22 6 22-15 22 7 22-18 26 6 24-15"
                  fill="none"
                  stroke="#458b60"
                  strokeWidth="2.5"
                />
              </svg>
            </div>
            <div className="auth-small-card card-stock">
              <span>
                <Package size={20} />
              </span>
              <div>
                <strong>Shelves? Sorted.</strong>
                <small>Everything in its place.</small>
              </div>
              <Check size={16} />
            </div>
            <div className="auth-small-card card-sale">
              <span>
                <ShoppingBag size={20} />
              </span>
              <div>
                <strong>Another happy customer.</strong>
                <small>Another little win.</small>
              </div>
              <Check size={16} />
            </div>
          </div>
        </div>
        <div className="auth-story-footer">
          <span>
            <ShieldCheck size={17} />
            Your business. Your data. Always.
          </span>
          <small>Built for the everyday extraordinary.</small>
        </div>
      </section>
      <section className="auth-form-side">
        <div className="auth-top-link">
          Just looking around?
          <button
            className="auth-explore-link"
            onClick={startDemo}
            disabled={busy}
          >
            Explore the demo
            <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="auth-form-container">
          <div className="auth-welcome-icon">
            <ShoppingBag size={25} strokeWidth={1.7} />
          </div>
          <h2>
            {mode === "register"
              ? "Your next chapter starts here."
              : "Back to good business."}
          </h2>
          <p>
            {mode === "register"
              ? "Create a home for your business. Keep every little win."
              : "Welcome back. Your shop is right where you left it."}
          </p>
          <form onSubmit={submit} key={mode}>
            {mode === "register" && (
              <>
                <label className="form-field">
                  <span>Your full name</span>
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    placeholder="Alex Morgan"
                    maxLength={100}
                  />
                </label>
                <label className="form-field">
                  <span>Store name</span>
                  <input
                    name="storeName"
                    autoComplete="organization"
                    required
                    placeholder="The Everyday Store"
                    maxLength={100}
                  />
                </label>
              </>
            )}
            <label className="form-field">
              <span>Email address</span>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@yourstore.com"
                maxLength={254}
              />
            </label>
            <label className="form-field">
              <span>Password</span>
              <div className="password-input">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete={
                    mode === "register" ? "new-password" : "current-password"
                  }
                  placeholder={
                    mode === "register"
                      ? "At least 8 characters"
                      : "Enter your password"
                  }
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {mode === "register" && (
              <p className="auth-data-note">
                <Check size={14} />
                Your demo data comes with you. No credit card required.
              </p>
            )}
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            {cookieBlocked && (
              <a
                className="auth-session-help"
                href="/login"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open KraTte in a new tab
                <ArrowUpRight size={15} />
              </a>
            )}
            <button
              className="button button-primary auth-submit"
              disabled={busy}
            >
              {busy ? <Spinner /> : null}
              {busy
                ? "A little moment…"
                : mode === "register"
                  ? "Create your workspace"
                  : "Sign in to your workspace"}
              {!busy && <ArrowRight size={17} />}
            </button>
          </form>
          <div className="auth-divider">
            <span>or keep it simple</span>
          </div>
          <button
            className="button demo-button"
            onClick={startDemo}
            disabled={busy}
          >
            <StoreIcon />
            Explore a fully stocked demo
            <ArrowUpRight size={16} />
          </button>
          <p className="auth-mode-switch">
            {mode === "register"
              ? "Already part of the neighborhood?"
              : "New to KraTte?"}{" "}
            <button
              onClick={() => {
                setMode(mode === "register" ? "login" : "register");
                setError("");
              }}
            >
              {mode === "register" ? "Sign in" : "Create an account"}
            </button>
          </p>
          <div className="auth-security">
            <LockKeyhole size={14} />
            Secure sign-in. Private workspace. Peace of mind.
          </div>
        </div>
        <div className="auth-bottom">
          <span>© {new Date().getFullYear()} KraTte</span>
          <span>Made for your kind of business.</span>
        </div>
      </section>
    </main>
  );
}
function StoreIcon() {
  return <ShoppingBag size={17} />;
}
