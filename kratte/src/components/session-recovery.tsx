"use client";
import { useState, type FormEvent } from "react";
import { ArrowUpRight, LockKeyhole, ShieldCheck, Store } from "lucide-react";
import { Modal, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/client-api";
import type { Profile, Workspace } from "@/lib/types";

export function SessionRecovery({
  profile,
  message,
  onClose,
  onRestored,
}: {
  profile: Profile | null;
  message: string;
  onClose: () => void;
  onRestored: (profile: Profile) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cookieBlocked, setCookieBlocked] = useState(false);
  const [confirmDemo, setConfirmDemo] = useState(false);
  const account = profile && !profile.isDemo;
  async function confirmSession() {
    const result = await api<{ user: Profile | null }>("/api/auth");
    if (!result.user) {
      setCookieBlocked(true);
      throw new ApiError(
        "Your browser is blocking the secure session in this preview. Open KraTte in its own tab and sign in there.",
        401,
        "COOKIES_BLOCKED",
      );
    }
    return result.user;
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    try {
      await api("/api/auth", {
        method: "POST",
        body: JSON.stringify({ ...values, action: "login" }),
      });
      await onRestored(await confirmSession());
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to reconnect. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Reconnect your workspace"
      description={
        account
          ? "Your saved records are safe. Sign in to continue where you left off."
          : "Let’s get you back to a working session."
      }
      onClose={() => {
        if (!busy) onClose();
      }}
      className="session-recovery"
    >
      <form onSubmit={submit}>
        <div className="modal-body">
          <div className="recovery-note">
            <ShieldCheck size={20} />
            <p>
              {account
                ? `Continue as ${profile.name} at ${profile.storeName}. Your open form will stay in place.`
                : message ||
                  "This session has ended. Sign in to a saved account, or choose a fresh demo below."}
            </p>
          </div>
          <div className="recovery-fields">
            <label className="form-field">
              <span>Account email</span>
              <input
                type="email"
                name="email"
                required
                autoComplete="username"
                defaultValue={account ? profile.email : ""}
                readOnly={!!account}
                placeholder="you@yourstore.com"
              />
            </label>
            <label className="form-field">
              <span>Password</span>
              <input
                type="password"
                name="password"
                required
                minLength={8}
                maxLength={128}
                autoComplete="current-password"
                placeholder="Enter your password"
              />
            </label>
          </div>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <button
            className="button button-primary recovery-submit"
            disabled={busy}
          >
            {busy ? <Spinner /> : <LockKeyhole size={16} />}Sign in & continue
          </button>
          <a
            className="recovery-new-tab text-link"
            href="/login"
            target="_blank"
            rel="noopener noreferrer"
          >
            {cookieBlocked
              ? "Open KraTte to finish signing in"
              : "Having trouble in the preview? Open in a new tab"}
            <ArrowUpRight size={15} />
          </a>
          {!account && (
            <div className="recovery-demo">
              <p>
                {confirmDemo
                  ? "A fresh demo starts with sample data. It won’t restore changes from the expired demo. Saved account data is not deleted."
                  : "Just exploring? You can start a fresh, private demo instead."}
              </p>
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={async () => {
                  if (!confirmDemo) {
                    setConfirmDemo(true);
                    return;
                  }
                  setBusy(true);
                  setError("");
                  try {
                    await api<Workspace>("/api/workspace", {
                      method: "POST",
                      body: JSON.stringify({ action: "start-demo" }),
                    });
                    await confirmSession();
                    window.location.reload();
                  } catch (failure) {
                    setError(
                      failure instanceof Error
                        ? failure.message
                        : "Unable to open the demo.",
                    );
                    setBusy(false);
                  }
                }}
              >
                <Store size={15} />
                {confirmDemo ? "Confirm fresh demo" : "Start a fresh demo"}
              </button>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <span className="save-note">
            No records are deleted when a session expires.
          </span>
          <button
            type="button"
            className="button"
            onClick={onClose}
            disabled={busy}
          >
            Not now
          </button>
        </div>
      </form>
    </Modal>
  );
}
