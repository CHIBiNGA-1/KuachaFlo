"use client";

import { useEffect, useState } from "react";
import { Sheet } from "../Sheet";
import {
  ApiError,
  listMyPaymentRequests,
  submitPaymentRequest,
  type PaymentRequest,
} from "@/lib/account";

const MOMO_NUMBERS = {
  airtel: process.env.NEXT_PUBLIC_AIRTEL_MOMO_NUMBER || "+260 772 157 122",
  mtn: process.env.NEXT_PUBLIC_MTN_MOMO_NUMBER || "+260 767 813 440",
};

const PLANS = [
  {
    id: "free" as const,
    name: "Free",
    price: 0,
    blurb: "Try it out",
    features: ["100 entries", "AI auto-categorization", "CSV export"],
  },
  {
    id: "pro" as const,
    name: "Pro",
    price: 150,
    blurb: "For individuals & sole traders",
    features: ["1,000 entries", "AI auto-categorization", "CSV + PDF export", "Priority processing"],
  },
  {
    id: "business" as const,
    name: "Business",
    price: 450,
    blurb: "For growing operations",
    features: ["Unlimited entries", "Everything in Pro", "Priority support"],
  },
];

type PlanId = "free" | "pro" | "business";

function statusStyle(status: string): { background: string; color: string } {
  if (status === "confirmed") return { background: "var(--accent-wash)", color: "var(--green)" };
  if (status === "rejected") return { background: "var(--accent-wash)", color: "var(--red)" };
  return { background: "var(--accent-wash)", color: "var(--amber)" };
}

export function BillingSheet({
  plan,
  onClose,
}: {
  plan: string;
  onClose: () => void;
}) {
  const current = (["free", "pro", "business"].includes(plan) ? plan : "free") as PlanId;
  const [selected, setSelected] = useState<"pro" | "business">(
    current === "business" ? "business" : "pro"
  );
  const [network, setNetwork] = useState<"airtel" | "mtn">("airtel");
  const [reference, setReference] = useState("");
  const [senderNumber, setSenderNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [requests, setRequests] = useState<PaymentRequest[]>([]);

  useEffect(() => {
    listMyPaymentRequests()
      .then(setRequests)
      .catch(() => {
        /* reader not connected yet — history simply stays hidden */
      });
  }, []);

  const tier = PLANS.find((p) => p.id === selected)!;

  async function submit() {
    if (!reference.trim()) {
      setError("Enter the transaction reference from your MoMo confirmation SMS.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitPaymentRequest({
        plan_requested: selected,
        amount: tier.price,
        currency: "ZMW",
        momo_network: network,
        momo_reference: reference.trim(),
        momo_sender_number: senderNumber.trim() || null,
      });
      setSuccess(true);
      setReference("");
      setSenderNumber("");
      try {
        setRequests(await listMyPaymentRequests());
      } catch {
        /* refresh is a nicety */
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet kicker="Billing" title="Upgrade your plan" onClose={onClose}>
      <div className="flex flex-col gap-2">
        {PLANS.map((p) => {
          const isCurrent = current === p.id;
          const isSelected = selected === p.id;
          return (
            <button
              key={p.id}
              disabled={p.id === "free" || isCurrent}
              onClick={() => p.id !== "free" && setSelected(p.id)}
              className="rounded-2xl border p-4 text-left"
              style={{
                borderColor: isCurrent || isSelected ? "var(--ink)" : "var(--line)",
                background: isCurrent ? "var(--bg)" : "var(--surface)",
                outline: isCurrent || isSelected ? "1px solid var(--ink)" : "none",
                opacity: p.id === "free" && !isCurrent ? 0.75 : 1,
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-extrabold">{p.name}</span>
                {isCurrent && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide"
                    style={{ background: "var(--ink)", color: "#fff" }}
                  >
                    Current
                  </span>
                )}
                {isSelected && !isCurrent && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide"
                    style={{ background: "var(--accent)", color: "#fff" }}
                  >
                    Selected
                  </span>
                )}
                <span className="tnum ml-auto font-display text-[18px]">
                  {p.price === 0 ? "Free" : `K${p.price}`}
                </span>
              </div>
              <div className="mt-0.5 text-[12px] text-muted">{p.blurb}</div>
              <div className="mt-1.5 text-[12px] leading-relaxed text-muted">
                {p.features.join(" · ")}
              </div>
            </button>
          );
        })}
      </div>

      {current !== "business" && (
        <div className="mt-5">
          <div className="grid grid-cols-2 gap-2">
            {(["airtel", "mtn"] as const).map((n) => {
              const isNetSelected = network === n;
              return (
                <button
                  key={n}
                  onClick={() => setNetwork(n)}
                  className="rounded-2xl border p-3.5 text-left"
                  style={{
                    borderColor: isNetSelected ? "var(--ink)" : "var(--line)",
                    background: "var(--bg)",
                    outline: isNetSelected ? "1px solid var(--ink)" : "none",
                  }}
                >
                  <div className="kicker">{n === "airtel" ? "Airtel Money" : "MTN MoMo"}</div>
                  <div className="tnum mt-1 text-[14px] font-black">{MOMO_NUMBERS[n]}</div>
                </button>
              );
            })}
          </div>

          {success ? (
            <div
              className="mt-3 rounded-2xl p-4 text-[13px] font-semibold leading-relaxed"
              style={{ background: "var(--accent-wash)", color: "var(--green)" }}
            >
              ✓ Submitted — we&apos;ll verify shortly.
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2.5">
              <p className="text-[12px] leading-relaxed text-muted">
                Send <b>K{tier.price}</b> to the number above, then confirm below.
              </p>
              <input
                className="field"
                placeholder="Transaction reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
              <input
                className="field"
                placeholder="Number you paid from (optional)"
                value={senderNumber}
                onChange={(e) => setSenderNumber(e.target.value)}
              />
              {error && (
                <p className="text-[13px] font-bold" style={{ color: "var(--red)" }}>
                  {error}
                </p>
              )}
              <button onClick={submit} disabled={submitting} className="btn btn-accent w-full">
                {submitting ? "Submitting…" : "Submit for verification"}
              </button>
            </div>
          )}
        </div>
      )}

      {requests.length > 0 && (
        <div className="mt-4">
          <div className="kicker">Your payment requests</div>
          <div className="mt-1.5 flex flex-col gap-2">
            {requests.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-2xl p-3.5"
                style={{ background: "var(--bg)" }}
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-bold">
                    {r.plan_requested} — K{r.amount} via {r.momo_network.toUpperCase()}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
                    {r.momo_reference}
                  </div>
                </div>
                <span
                  className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide"
                  style={statusStyle(r.status)}
                >
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}