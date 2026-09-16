"use client";

import { useEffect, useState } from "react";
import { Sheet } from "../Sheet";
import {
  ApiError,
  requestLinkCode,
  unlinkWhatsApp,
  type WhatsAppLinkCode,
} from "@/lib/account";

const COPY = {
  title: "Ring up sales over WhatsApp",
  linked:
    "This account is linked to WhatsApp. Send a day-sales tally or a till-roll photo to",
  linkedTail: "and it'll ring up into Sales.",
} as const;

export function WhatsAppSheet({ onClose }: { onClose: () => void }) {
  const [link, setLink] = useState<WhatsAppLinkCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const copy = COPY;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setLink(await requestLinkCode());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't reach the server — try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function unlink() {
    setUnlinking(true);
    try {
      await unlinkWhatsApp();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't unlink — try again.");
      setUnlinking(false);
    }
  }

  return (
    <Sheet
      kicker="Beta"
      title={copy.title}
      onClose={onClose}
      foot="Optional — the app works fine without it."
    >
      {loading ? (
        <p className="text-[13px] text-muted">Loading…</p>
      ) : error && !link ? (
        <div>
          <p className="text-[13px] text-muted">{error}</p>
          <button onClick={load} className="btn mt-3 w-full">
            Try again
          </button>
        </div>
      ) : link?.already_linked ? (
        <div>
          <p className="text-[13.5px] leading-relaxed text-muted">
            {copy.linked}{" "}
            <strong className="text-ink">{link.whatsapp_number || "the WhatsApp line"}</strong>{" "}
            {copy.linkedTail}
          </p>
          <button onClick={unlink} disabled={unlinking} className="btn mt-4 w-full">
            {unlinking ? "Unlinking…" : "Unlink this number"}
          </button>
          {error && (
            <p className="mt-2.5 text-[13px] font-bold" style={{ color: "var(--red)" }}>
              {error}
            </p>
          )}
        </div>
      ) : link ? (
        <div>
          {link.whatsapp_number ? (
            <>
              <p className="text-[13.5px] leading-relaxed text-muted">
                Save this number, then send your code as a message to link your account:
              </p>
              <div
                className="mt-3 rounded-2xl border p-4"
                style={{ borderColor: "var(--line)", background: "var(--bg)" }}
              >
                <div className="kicker">WhatsApp number</div>
                <div className="tnum text-[18px] font-black">{link.whatsapp_number}</div>
                <div className="kicker mt-3.5">Your code</div>
                <div className="tnum text-[28px] font-black tracking-[0.1em]">{link.code}</div>
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                <p className="text-[11.5px] text-muted">
                  Expires in {link.expires_in_minutes} minutes.
                </p>
                <button
                  onClick={load}
                  className="text-[11.5px] font-extrabold text-muted underline"
                >
                  Get a new code
                </button>
              </div>
            </>
          ) : (
            <p className="text-[13.5px] leading-relaxed text-muted">
              The WhatsApp line isn&apos;t set up yet — the founder is still wiring it.
              Everything in the app works without it.
            </p>
          )}
        </div>
      ) : null}

      <button onClick={onClose} className="btn btn-accent mt-5 w-full">
        Done
      </button>
    </Sheet>
  );
}