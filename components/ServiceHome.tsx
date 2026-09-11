"use client";

import { supabase, type ServiceChoice } from "@/lib/supabase";

const COPY: Record<ServiceChoice, { icon: string; name: string; line: string; next: string }> = {
  personal: {
    icon: "◌",
    name: "Personal",
    line: "Your money, handled.",
    next: "Receipt capture, MoMo timeline and reports land here in the next phase.",
  },
  shop: {
    icon: "⬣",
    name: "Shop",
    line: "Your business, in your pocket.",
    next: "Inventory, sales and customers land here in the next phase.",
  },
};

export function ServiceHome({
  choice,
  email,
  onSignOut,
}: {
  choice: ServiceChoice;
  email: string;
  onSignOut: () => void;
}) {
  const c = COPY[choice];

  async function signOut() {
    await supabase?.auth.signOut();
    onSignOut();
  }

  return (
    <div className="mx-auto max-w-xl px-5 pb-16 pt-14">
      <div className="flex items-center justify-between">
        <div
          className="grid h-11 w-11 place-items-center rounded-xl text-base font-black"
          style={{ background: "var(--ink)", color: "#d7f26d" }}
        >
          KF
        </div>
        <button onClick={signOut} className="text-xs font-bold text-muted underline">
          Sign out
        </button>
      </div>

      <div className="card mt-8 p-8 text-center">
        <div className="text-4xl">{c.icon}</div>
        <div className="kicker mt-4">Your locked path</div>
        <h1 className="mt-1 text-3xl font-black">{c.name}</h1>
        <p className="mt-1 text-sm font-bold text-muted">{c.line}</p>
        <div
          className="mx-auto mt-5 inline-block rounded-full px-4 py-1.5 text-[11px] font-extrabold uppercase tracking-wide"
          style={{ background: "var(--ink)", color: "#fff" }}
        >
          🔒 Choice locked · {email}
        </div>
        <p className="mx-auto mt-5 max-w-sm text-[13px] leading-relaxed text-muted">{c.next}</p>
      </div>

      <p className="mt-5 text-center text-[11px] text-muted">
        There is no way back to the fork — by design.
      </p>
    </div>
  );
}
