"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";
import type { UserProfile, PaymentRequest } from "@/lib/types";

// --- Edit these to match your real numbers/prices ---
const MOMO_NUMBERS = {
  airtel: process.env.NEXT_PUBLIC_AIRTEL_MOMO_NUMBER || "0XX XXX XXXX",
  mtn: process.env.NEXT_PUBLIC_MTN_MOMO_NUMBER || "0XX XXX XXXX",
};

const PLANS = [
  {
    id: "free" as const,
    name: "Free",
    price: 0,
    blurb: "Try it out",
    features: ["100 receipts", "AI auto-categorization", "CSV export"],
  },
  {
    id: "pro" as const,
    name: "Pro",
    price: 150,
    blurb: "For individuals & sole traders",
    features: ["1,000 receipts", "AI auto-categorization", "CSV + PDF export", "Priority processing"],
  },
  {
    id: "business" as const,
    name: "Business",
    price: 450,
    blurb: "For growing operations",
    features: ["Unlimited receipts", "Everything in Pro", "Priority support"],
  },
];

export default function BillingPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [myRequests, setMyRequests] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedPlan, setSelectedPlan] = useState<"pro" | "business">("pro");
  const [network, setNetwork] = useState<"airtel" | "mtn">("airtel");
  const [reference, setReference] = useState("");
  const [senderNumber, setSenderNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    (async () => {
      try {
        const [me, requests] = await Promise.all([
          api.get<UserProfile>("/api/v1/me"),
          api.get<PaymentRequest[]>("/api/v1/billing/payment-requests"),
        ]);
        setProfile(me);
        setMyRequests(requests);
      } catch {
        // best-effort — page still works for submitting a new request
      } finally {
        setLoading(false);
      }
    })();
  }, [session]);

  const selectedTier = PLANS.find(p => p.id === selectedPlan)!;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!reference.trim()) {
      setError("Enter the transaction reference from your MoMo confirmation SMS.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/api/v1/billing/payment-request", {
        plan_requested: selectedPlan,
        amount: selectedTier.price,
        currency: "ZMW",
        momo_network: network,
        momo_reference: reference.trim(),
        momo_sender_number: senderNumber.trim() || null,
      });
      setSuccess(true);
      setReference("");
      setSenderNumber("");
      const requests = await api.get<PaymentRequest[]>("/api/v1/billing/payment-requests");
      setMyRequests(requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!session) {
    return (
      <div style={styles.page}>
        <div style={styles.centered}>
          <p>Sign in to manage billing.</p>
          <Link href="/" style={styles.link}>← Back to app</Link>
        </div>
      </div>
    );
  }

  const currentPlan = profile?.plan ?? "free";

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <Link href="/" style={styles.backLink}>← Back to app</Link>
        <div className="kicker">Billing</div>
        <h1 style={styles.h1}>Upgrade your plan</h1>
        <p style={styles.subtitle}>
          Pay via Airtel Money or MTN MoMo, submit your transaction reference below,
          and your plan activates once it's verified — usually within a few hours.
        </p>

        <div style={styles.plansGrid}>
          {PLANS.map(plan => (
            <div
              key={plan.id}
              className="card"
              style={{
                ...styles.planCard,
                ...(currentPlan === plan.id ? styles.planCardActive : {}),
              }}
            >
              <div style={styles.planName}>
                {plan.name}
                {currentPlan === plan.id && <span style={styles.currentBadge}>Current</span>}
              </div>
              <div style={styles.planPrice}>
                {plan.price === 0 ? "Free" : `K${plan.price}`}
                {plan.price > 0 && <span style={styles.perMonth}>/month</span>}
              </div>
              <div style={styles.planBlurb}>{plan.blurb}</div>
              <ul style={styles.featureList}>
                {plan.features.map(f => <li key={f}>{f}</li>)}
              </ul>
              {plan.id !== "free" && currentPlan !== plan.id && (
                <button
                  className={`btn ${selectedPlan === plan.id ? "primary" : ""}`}
                  style={styles.selectBtn}
                  onClick={() => setSelectedPlan(plan.id)}
                >
                  {selectedPlan === plan.id ? "Selected" : "Select"}
                </button>
              )}
            </div>
          ))}
        </div>

        {currentPlan !== "business" && (
          <div className="card" style={styles.paymentCard}>
            <h2 style={styles.h2}>Pay for {selectedTier.name} — K{selectedTier.price}/month</h2>

            <div style={styles.momoBoxes}>
              <div style={styles.momoBox}>
                <div style={styles.momoLabel}>Airtel Money</div>
                <div style={styles.momoNumber}>{MOMO_NUMBERS.airtel}</div>
              </div>
              <div style={styles.momoBox}>
                <div style={styles.momoLabel}>MTN MoMo</div>
                <div style={styles.momoNumber}>{MOMO_NUMBERS.mtn}</div>
              </div>
            </div>
            <p style={styles.instructions}>
              Send <strong>K{selectedTier.price}</strong> to the number above, then fill in
              the details from your confirmation SMS below.
            </p>

            {success ? (
              <div style={styles.successBox}>
                ✓ Submitted — we'll verify and activate your plan shortly. You can track the
                status below.
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={styles.form}>
                <div style={styles.formRow}>
                  <label style={styles.label}>
                    Network
                    <select
                      value={network}
                      onChange={e => setNetwork(e.target.value as "airtel" | "mtn")}
                      style={styles.input}
                    >
                      <option value="airtel">Airtel Money</option>
                      <option value="mtn">MTN MoMo</option>
                    </select>
                  </label>
                  <label style={styles.label}>
                    Plan
                    <select
                      value={selectedPlan}
                      onChange={e => setSelectedPlan(e.target.value as "pro" | "business")}
                      style={styles.input}
                    >
                      <option value="pro">Pro — K150/month</option>
                      <option value="business">Business — K450/month</option>
                    </select>
                  </label>
                </div>
                <label style={styles.label}>
                  Transaction reference (from your confirmation SMS)
                  <input
                    type="text"
                    value={reference}
                    onChange={e => setReference(e.target.value)}
                    placeholder="e.g. MP240819.1234.A56789"
                    style={styles.input}
                  />
                </label>
                <label style={styles.label}>
                  Number you paid from (optional, helps us match faster)
                  <input
                    type="text"
                    value={senderNumber}
                    onChange={e => setSenderNumber(e.target.value)}
                    placeholder="e.g. 097XXXXXXX"
                    style={styles.input}
                  />
                </label>
                {error && <div style={styles.errorText}>{error}</div>}
                <button type="submit" className="btn primary" disabled={submitting} style={styles.submitBtn}>
                  {submitting ? "Submitting…" : "I've paid — submit for verification"}
                </button>
              </form>
            )}
          </div>
        )}

        {myRequests.length > 0 && (
          <div className="card" style={styles.historyCard}>
            <h2 style={styles.h2}>Your payment requests</h2>
            <div style={styles.historyList}>
              {myRequests.map(r => (
                <div key={r.id} style={styles.historyRow}>
                  <div>
                    <strong>{r.plan_requested}</strong> — K{r.amount} via {r.momo_network.toUpperCase()}
                    <div style={styles.historyRef}>{r.momo_reference}</div>
                  </div>
                  <span style={{ ...styles.statusBadge, ...statusStyle(r.status) }}>{r.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function statusStyle(status: string) {
  if (status === "confirmed") return { background: "#dcefd7", color: "#1e5c2e" };
  if (status === "rejected") return { background: "#f6d1cc", color: "#7a2318" };
  return { background: "#f6e5b8", color: "#6b4e0a" };
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "var(--bg)", padding: "30px 20px 60px" },
  container: { maxWidth: 880, margin: "0 auto" },
  centered: { textAlign: "center", paddingTop: 100 },
  link: { color: "var(--ink)" },
  backLink: { display: "inline-block", marginBottom: 16, color: "var(--muted)", fontSize: 13, fontWeight: 700, textDecoration: "none" },
  h1: { fontSize: "clamp(26px,3vw,36px)", letterSpacing: "-.05em", margin: "8px 0 0" },
  subtitle: { color: "var(--muted)", fontSize: 13, margin: "10px 0 28px", maxWidth: 560, lineHeight: 1.5 },
  plansGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 28 },
  planCard: { padding: 20, position: "relative" },
  planCardActive: { outline: "2px solid var(--ink)" },
  planName: { fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", gap: 8 },
  currentBadge: { fontSize: 10, fontWeight: 700, background: "var(--ink)", color: "#fff", padding: "2px 8px", borderRadius: 999, textTransform: "uppercase", letterSpacing: ".04em" },
  planPrice: { fontSize: 28, fontWeight: 880, letterSpacing: "-.04em", marginTop: 12 },
  perMonth: { fontSize: 12, fontWeight: 600, color: "var(--muted)", marginLeft: 4 },
  planBlurb: { color: "var(--muted)", fontSize: 12, marginTop: 4 },
  featureList: { marginTop: 14, paddingLeft: 18, fontSize: 12.5, color: "var(--ink)", lineHeight: 1.9 },
  selectBtn: { marginTop: 16, width: "100%" },
  paymentCard: { padding: 24, marginBottom: 20 },
  h2: { fontSize: 17, letterSpacing: "-.02em", marginBottom: 16 },
  momoBoxes: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 },
  momoBox: { background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 14, padding: "14px 16px" },
  momoLabel: { fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" },
  momoNumber: { fontSize: 20, fontWeight: 800, marginTop: 4, letterSpacing: "-.01em" },
  instructions: { fontSize: 13, color: "var(--muted)", marginBottom: 20, lineHeight: 1.5 },
  successBox: { background: "#dcefd7", color: "#1e5c2e", padding: "14px 16px", borderRadius: 14, fontSize: 13.5, fontWeight: 600 },
  form: { display: "flex", flexDirection: "column", gap: 14 },
  formRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  label: { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--muted)" },
  input: { padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 14, fontFamily: "inherit", color: "var(--ink)" },
  errorText: { color: "#c0392b", fontSize: 12.5, fontWeight: 600 },
  submitBtn: { alignSelf: "flex-start" },
  historyCard: { padding: 24 },
  historyList: { display: "flex", flexDirection: "column", gap: 10 },
  historyRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: "var(--surface-2)", borderRadius: 12, fontSize: 13 },
  historyRef: { fontSize: 11, color: "var(--muted)", fontFamily: "monospace", marginTop: 3 },
  statusBadge: { fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, textTransform: "uppercase", letterSpacing: ".03em" },
};
