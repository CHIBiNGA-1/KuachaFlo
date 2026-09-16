"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { applyTheme } from "@/lib/theme";
import { ShopShell } from "@/components/shop/Shell";

export default function Home() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  const refreshSession = useCallback(async () => {
    if (!supabase) {
      setSession(null);
      return;
    }
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
  }, []);

  useEffect(() => {
    applyTheme();
    refreshSession();
    if (!supabase) return;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, [refreshSession]);

  useEffect(() => {
    if (session === null) router.replace("/login");
  }, [session, router]);

  if (!supabaseConfigured) {
    return (
      <div className="grid min-h-screen place-items-center bg-paper p-6 text-center">
        <div className="card max-w-sm p-8">
          <div className="font-display text-xl">Not configured yet</div>
          <p className="mt-2 text-[13px] text-muted">
            Set <code className="text-ink">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code className="text-ink">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> in{" "}
            <code className="text-ink">.env.local</code>, then restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  if (session === undefined || session === null) {
    return (
      <div className="grid min-h-screen place-items-center bg-paper">
        <div className="flex flex-col items-center gap-3">
          <div
            className="grid h-14 w-14 animate-pulse place-items-center rounded-2xl font-display text-xl"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            K
          </div>
          <div className="animate-pulse text-[12px] font-bold text-muted">Opening…</div>
        </div>
      </div>
    );
  }

  return (
    <ShopShell
      email={session.user.email ?? ""}
      onSignOut={() => setSession(null)}
    />
  );
}
