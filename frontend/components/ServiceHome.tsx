"use client";

import type { ServiceChoice } from "@/lib/supabase";

export function ServiceHome({
  choice,
  email,
  onSignOut,
}: {
  choice: ServiceChoice;
  email: string;
  onSignOut: () => void;
}) {
  return (
    <div className="grid min-h-screen place-items-center px-6 text-center">
      <div className="w-full max-w-sm">
        <div
          className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-2xl text-xl font-black"
          style={{ background: "var(--ink)", color: "var(--accent)" }}
        >
          KF
        </div>
        <h1 className="mb-1 text-2xl font-black tracking-tight">
          {choice === "personal" ? "Personal" : "Shop"}
        </h1>
        <p className="mb-8 text-sm text-muted">Signed in as {email}</p>
        <button onClick={onSignOut} className="text-xs font-bold text-muted underline">
          Sign out
        </button>
      </div>
    </div>
  );
}
