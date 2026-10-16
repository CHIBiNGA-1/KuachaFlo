"use client";

import { useResync } from "@/lib/offline/hooks";
import { useCallback, useEffect, useState } from "react";
import { fetchMyPlan, PLAN_NAMES } from "@/lib/format";
import { THEMES, applyTheme, getTheme, type Theme } from "@/lib/theme";
import { BillingSheet } from "../account/BillingSheet";
import { WhatsAppSheet } from "../account/WhatsAppSheet";
import {
  ShopError,
  getBusiness,
  updateBusiness,
  type ShopBusiness,
} from "@/lib/shop";

export function SettingsTab({
  onBack,
  onSignOut,
}: {
  onBack: () => void;
  onSignOut: () => void;
}) {
  const [business, setBusiness] = useState<ShopBusiness | null>(null);
  const [plan, setPlan] = useState("free");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [billing, setBilling] = useState(false);
  const [wa, setWa] = useState(false);
  const [theme, setTheme] = useState<Theme>("studio");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [b, p] = await Promise.all([getBusiness(), fetchMyPlan().catch(() => "free")]);
      setBusiness(b);
      setPlan(p);
      setName(b.name);
    } catch (e) {
      setError(e instanceof ShopError ? e.message : "Couldn't load — try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    setTheme(getTheme());
  }, [load]);
  useResync(load);

  async function save() {
    if (!name.trim()) {
      setSaveError("The shop needs a name.");
      return;
    }
    setBusy(true);
    setSaveError(null);
    try {
      const b = await updateBusiness(name.trim());
      setBusiness(b);
      setEditing(false);
    } catch (e) {
      setSaveError(e instanceof ShopError ? e.message : "Couldn't save — try again.");
    } finally {
      setBusy(false);
    }
  }

  function pickTheme(t: Theme) {
    setTheme(t);
    applyTheme(t);
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="text-[13px] font-extrabold text-muted"
        aria-label="Back to More"
      >
        ‹ More
      </button>
      <h1 className="mt-1.5 font-display text-[34px] leading-tight">Settings.</h1>
      <p className="mt-1 text-[13px] text-muted">Your shop, your way.</p>

      {loading ? (
        <div className="card mt-4 animate-pulse p-8 text-center text-[13px] font-bold text-muted">
          Opening settings…
        </div>
      ) : error || !business ? (
        <div className="card mt-4 p-8 text-center">
          <div className="kicker">Something hiccuped</div>
          <p className="mt-2 text-[13px] font-bold">{error || "Couldn't load settings."}</p>
          <button onClick={load} className="btn btn-dark mt-4">
            Try again
          </button>
        </div>
      ) : (
        <div className="card mt-4 px-5 py-2">
          <div className="py-3.5" style={{ borderBottom: "1px solid var(--line)" }}>
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-extrabold">Shop name</span>
                {!editing && (
                  <span className="block text-[12px] text-muted">{business.name}</span>
                )}
              </span>
              {!editing && (
                <button
                  onClick={() => {
                    setName(business.name);
                    setSaveError(null);
                    setEditing(true);
                  }}
                  className="shrink-0 text-[12px] font-extrabold text-muted underline"
                >
                  Edit
                </button>
              )}
            </div>
            {editing && (
              <div className="mt-2.5 flex gap-2">
                <input
                  className="field min-w-0 flex-1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Chileshe's Corner"
                  aria-label="Shop name"
                />
                <button onClick={save} disabled={busy} className="btn btn-accent shrink-0">
                  {busy ? "…" : "Save"}
                </button>
              </div>
            )}
            {editing && (
              <button
                onClick={() => setEditing(false)}
                className="mt-1.5 text-[12px] font-extrabold text-muted underline"
              >
                Cancel
              </button>
            )}
            {saveError && (
              <p className="mt-1.5 text-[13px] font-bold" style={{ color: "var(--red)" }}>
                {saveError}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 py-3.5" style={{ borderBottom: "1px solid var(--line)" }}>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-extrabold">Currency</span>
              <span className="block text-[12px] text-muted">
                {business.currency} · set when your shop opened
              </span>
            </span>
          </div>

          <div className="py-3.5" style={{ borderBottom: "1px solid var(--line)" }}>
            <span className="block text-[14px] font-extrabold">Theme</span>
            <div className="mt-2 flex gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => pickTheme(t.id)}
                  className="flex flex-col items-center gap-1.5"
                  aria-label={`${t.label} theme`}
                >
                  <span
                    className="grid h-9 w-9 place-items-center rounded-xl border-2 transition-transform"
                    style={{
                      background: t.swatch,
                      borderColor: theme === t.id ? "var(--accent)" : "var(--line)",
                      transform: theme === t.id ? "scale(1.1)" : "scale(1)",
                    }}
                  >
                    {theme === t.id && (
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: "var(--accent)" }}
                      />
                    )}
                  </span>
                  <span
                    className="text-[10px] font-bold"
                    style={{ color: theme === t.id ? "var(--ink)" : "var(--muted)" }}
                  >
                    {t.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setBilling(true)}
            className="flex w-full items-center gap-3 py-3.5 text-left"
            style={{ borderBottom: "1px solid var(--line)" }}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-extrabold">Plan</span>
              <span className="block text-[12px] text-muted">
                {PLAN_NAMES[plan] || "Free"} · one plan, whichever road you&apos;re on
              </span>
            </span>
            <span className="shrink-0 text-[12px] font-extrabold text-muted underline">Manage</span>
          </button>

          <button
            onClick={() => setWa(true)}
            className="flex w-full items-center gap-3 py-3.5 text-left"
            style={{ borderBottom: "1px solid var(--line)" }}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-extrabold">WhatsApp</span>
              <span className="block text-[12px] text-muted">
                Day-sales tallies, rung up from chat
              </span>
            </span>
            <span className="shrink-0 text-[12px] font-extrabold text-muted underline">Link</span>
          </button>

          <div className="py-4">
            <button
              onClick={onSignOut}
              className="text-[13px] font-bold text-muted transition-colors hover:text-ink"
            >
              Sign out
            </button>
          </div>
        </div>
      )}

      {billing && <BillingSheet plan={plan} onClose={() => setBilling(false)} />}
      {wa && <WhatsAppSheet onClose={() => setWa(false)} />}
    </div>
  );
}