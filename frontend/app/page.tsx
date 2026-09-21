"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { applyTheme } from "@/lib/theme";

export default function LandingPage() {
  // No auth check gates anything on this page — it must render the same
  // for a logged-out visitor, a crawler, or a reviewer with no session at
  // all. The only thing session state changes is where the button below
  // points, and that's a client-side enhancement, not a redirect.
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    applyTheme();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  return (
    <div style={{ background: "var(--bg)", color: "var(--ink)" }} className="min-h-screen">
      <header className="mx-auto flex max-w-[960px] items-center justify-between px-5 py-6">
        <div className="flex items-center gap-2">
          <div
            className="grid h-9 w-9 place-items-center rounded-xl font-display text-lg"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            K
          </div>
          <span className="font-display text-[18px]">KraTte</span>
        </div>
        <nav className="flex items-center gap-4 text-[13px] font-bold">
          <Link href="/login" className="text-muted">
            Log in
          </Link>
          <Link href={supabaseConfigured && signedIn ? "/app" : "/signup"} className="btn btn-dark px-4 py-2">
            {supabaseConfigured && signedIn ? "Go to your shop" : "Get started"}
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-[720px] px-5 pb-20 pt-10 text-center">
        <div className="kicker">Point-of-sale & inventory management</div>
        <h1 className="mt-3 font-display text-[40px] leading-[1.1] sm:text-[52px]">
          KraTte — run your shop with clarity
        </h1>
        <p className="mx-auto mt-4 max-w-[520px] text-[16px] leading-relaxed text-muted">
          KraTte is a minimal shop management system designed for retail
          merchants to track inventory, process daily sales, and manage
          receipts — all in one calm workspace. Ring up a sale, watch stock
          update itself, and see where the money went, without a bloated
          back office to fight through.
        </p>

        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href={supabaseConfigured && signedIn ? "/app" : "/signup"}
            className="btn btn-accent px-6 py-3 text-[15px]"
          >
            {supabaseConfigured && signedIn ? "Go to your shop" : "Sign in"}
          </Link>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-4 text-left sm:grid-cols-3">
          <div className="card p-5">
            <div className="font-display text-[16px]">Inventory</div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              Stock levels that update themselves the moment a sale or a
              delivery is logged.
            </p>
          </div>
          <div className="card p-5">
            <div className="font-display text-[16px]">Daily sales</div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              Ring up a sale in seconds, or capture a day's tally straight
              from a WhatsApp photo.
            </p>
          </div>
          <div className="card p-5">
            <div className="font-display text-[16px]">Receipts & expenses</div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              Every receipt, supplier note, and expense filed in one place —
              no spreadsheet required.
            </p>
          </div>
        </div>
      </main>

      <footer
        className="mx-auto flex max-w-[960px] flex-col items-center gap-3 border-t px-5 py-8 text-[13px] text-muted sm:flex-row sm:justify-between"
        style={{ borderColor: "var(--line)" }}
      >
        <span>© {new Date().getFullYear()} KraTte</span>
        <div className="flex items-center gap-5">
          <Link href="/privacy" style={{ color: "var(--ink)" }} className="underline">
            Privacy Policy
          </Link>
          <Link href="/terms" style={{ color: "var(--ink)" }} className="underline">
            Terms of Service
          </Link>
        </div>
      </footer>
    </div>
  );
}
