"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getBusiness } from "@/lib/shop";
import type { PartyKind } from "@/lib/shop";
import {
  GlyphBox,
  GlyphCart,
  GlyphChart,
  GlyphDots,
  GlyphRows,
  GlyphStore,
  GlyphTray,
  GlyphYou,
} from "../Glyph";
import { OverviewTab } from "./OverviewTab";
import { InventoryTab } from "./InventoryTab";
import { OrdersTab } from "./OrdersTab";
import { PeopleTab } from "./PeopleTab";
import { ExpensesTab } from "./ExpensesTab";
import { ReportsTab } from "./ReportsTab";
import { SettingsTab } from "./SettingsTab";

type Tab =
  | "overview"
  | "sales"
  | "purchases"
  | "inventory"
  | "customers"
  | "suppliers"
  | "team"
  | "expenses"
  | "reports"
  | "settings";

const NAV: { id: Tab; label: string; glyph: (a: { size?: number }) => React.ReactNode }[] = [
  { id: "overview", label: "Overview", glyph: (p) => <GlyphStore {...p} /> },
  { id: "sales", label: "Sales", glyph: (p) => <GlyphCart {...p} /> },
  { id: "purchases", label: "Purchases", glyph: (p) => <GlyphTray {...p} /> },
  { id: "inventory", label: "Inventory", glyph: (p) => <GlyphBox {...p} /> },
  { id: "customers", label: "People", glyph: (p) => <GlyphYou {...p} /> },
  { id: "expenses", label: "Expenses", glyph: (p) => <GlyphRows {...p} /> },
  { id: "reports", label: "Reports", glyph: (p) => <GlyphChart {...p} /> },
  { id: "settings", label: "Settings", glyph: (p) => <GlyphDots {...p} /> },
];

// The bottom bar on mobile stays to five items — the rest live under People.
const MOBILE_NAV: Tab[] = ["overview", "sales", "purchases", "inventory", "settings"];

export function ShopShell({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [inventoryFilter, setInventoryFilter] = useState<"all" | "attention" | "saved">("all");
  const [shopName, setShopName] = useState<string>("");
  const [currency, setCurrency] = useState("ZMW");

  useEffect(() => {
    getBusiness()
      .then((b) => {
        setShopName(b.name);
        setCurrency(b.currency);
      })
      .catch(() => {
        /* the shop auto-provisions on first touch; a transient failure
           here just means the header shows its fallback for now */
      });
  }, []);

  async function signOut() {
    await supabase?.auth.signOut();
    onSignOut();
  }

  function goLowStock() {
    setInventoryFilter("attention");
    setTab("inventory");
  }

  function openPeople(kind: PartyKind) {
    setTab(kind);
  }

  const initials = (email || "K").trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-paper md:flex md:items-start md:gap-4 md:p-4 lg:gap-6 lg:p-6">
      {/* ── Desktop sidebar ─────────────────────────────────────────── */}
      <aside className="sticky top-6 hidden h-[calc(100vh-48px)] w-[220px] shrink-0 flex-col rounded-lg2 border border-line bg-surface p-4 shadow-card md:flex">
        <div className="flex items-center gap-2.5 px-1">
          <div
            className="grid h-9 w-9 place-items-center rounded-xl font-display text-[15px]"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            K
          </div>
          <span className="font-display text-[19px]">KraTte</span>
        </div>

        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {NAV.map((n) => {
            const active =
              tab === n.id || (n.id === "customers" && ["customers", "suppliers", "team"].includes(tab));
            return (
              <button
                key={n.id}
                onClick={() => (n.id === "customers" ? openPeople("customers") : setTab(n.id))}
                className="flex items-center gap-3 rounded-pill px-3 py-2.5 text-left text-[13px] font-semibold transition-colors"
                style={{
                  background: active ? "var(--accent-wash)" : "transparent",
                  color: active ? "var(--accent-deep)" : "var(--muted)",
                }}
              >
                <span className="shrink-0" style={{ color: active ? "var(--accent-deep)" : "var(--muted)" }}>
                  {n.glyph({ size: 18 })}
                </span>
                {n.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-4 flex items-center gap-2.5 rounded-pill border border-line px-2.5 py-2">
          <div
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold"
            style={{ background: "var(--surface-2)", color: "var(--ink)" }}
          >
            {initials}
          </div>
          <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{email || "Signed in"}</span>
          <button onClick={signOut} className="shrink-0 text-[11px] font-bold text-muted hover:text-ink">
            Out
          </button>
        </div>
      </aside>

      {/* ── Content ─────────────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-2xl px-5 pb-28 pt-6 md:max-w-none md:flex-1 md:px-0 md:pb-6 md:pt-0">
        <div className="md:card md:p-8">
          {/* Mobile-only top bar */}
          <div className="flex items-center justify-between md:hidden">
            <div className="flex items-center gap-2.5">
              <div
                className="grid h-9 w-9 place-items-center rounded-xl font-display text-[13px]"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                K
              </div>
              <span className="font-display text-[17px]">KraTte</span>
            </div>
            <button onClick={signOut} className="text-xs font-bold text-muted underline">
              Sign out
            </button>
          </div>

          <div className="mt-5 md:mt-0">
            {tab === "overview" ? (
              <OverviewTab
                shopName={shopName}
                onLowStock={goLowStock}
                onOpenInventory={() => {
                  setInventoryFilter("all");
                  setTab("inventory");
                }}
                onNewSale={() => setTab("sales")}
                onRestock={() => setTab("purchases")}
                onOpenOrders={() => setTab("sales")}
              />
            ) : tab === "inventory" ? (
              <InventoryTab
                initialFilter={inventoryFilter}
                currency={currency}
                onSell={() => setTab("sales")}
                onRestock={() => setTab("purchases")}
              />
            ) : tab === "sales" ? (
              <OrdersTab kind="sale" />
            ) : tab === "purchases" ? (
              <OrdersTab kind="purchase" />
            ) : tab === "customers" || tab === "suppliers" || tab === "team" ? (
              <div>
                <div className="mb-4 inline-flex gap-1 rounded-pill border border-line bg-surface2 p-1">
                  {(["customers", "suppliers", "team"] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => setTab(k)}
                      className="rounded-pill px-3.5 py-1.5 text-[12px] font-bold capitalize transition-colors"
                      style={{
                        background: tab === k ? "var(--surface)" : "transparent",
                        color: tab === k ? "var(--ink)" : "var(--muted)",
                        boxShadow: tab === k ? "var(--shadow-card)" : "none",
                      }}
                    >
                      {k}
                    </button>
                  ))}
                </div>
                <PeopleTab kind={tab} onBack={() => setTab("overview")} />
              </div>
            ) : tab === "expenses" ? (
              <ExpensesTab onBack={() => setTab("overview")} />
            ) : tab === "reports" ? (
              <ReportsTab
                onBack={() => setTab("overview")}
                onOpenCustomers={() => openPeople("customers")}
                onReviewInventory={goLowStock}
              />
            ) : (
              <SettingsTab onBack={() => setTab("overview")} />
            )}
          </div>
        </div>
      </main>

      {/* ── Mobile bottom bar ───────────────────────────────────────── */}
      <nav
        className="fixed inset-x-0 bottom-0 border-t md:hidden"
        style={{ background: "var(--surface)", borderColor: "var(--line)" }}
      >
        <div className="mx-auto grid max-w-xl grid-cols-5 px-5 pt-2">
          {MOBILE_NAV.map((id) => {
            const n = NAV.find((x) => x.id === id)!;
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className="flex flex-col items-center gap-1 py-1.5"
                style={{ color: active ? "var(--ink)" : "var(--muted)" }}
                aria-current={active ? "page" : undefined}
              >
                {n.glyph({})}
                <span className="text-[11px] font-extrabold">{n.label}</span>
                <span
                  className="h-1 w-1 rounded-full"
                  style={{ background: active ? "var(--accent)" : "transparent" }}
                />
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
