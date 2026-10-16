"use client";

import { useResync } from "@/lib/offline/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDay, money } from "@/lib/format";
import { ShopError, listExpenses, type ShopExpense } from "@/lib/shop";
import { GlyphTray } from "../Glyph";
import { ExpenseSheet } from "./ExpenseSheet";

type Filter = "all" | "Paid" | "Unpaid";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "Paid", label: "Paid" },
  { id: "Unpaid", label: "Unpaid" },
];

export function ExpensesTab({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<ShopExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<
    { mode: "closed" } | { mode: "new" } | { mode: "view"; expense: ShopExpense }
  >({ mode: "closed" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listExpenses());
    } catch (e) {
      setError(e instanceof ShopError ? e.message : "Couldn't load — try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useResync(load);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((e) => {
      if (filter !== "all" && e.paid !== filter) return false;
      if (q && !`${e.name} ${e.category}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, filter, query]);

  const monthKey = new Date().toISOString().slice(0, 7);
  const monthOut = items
    .filter((e) => (e.date || "").startsWith(monthKey))
    .reduce((s, e) => s + (e.amount || 0), 0);
  const unpaid = items.filter((e) => e.paid === "Unpaid").reduce((s, e) => s + (e.amount || 0), 0);
  const paidCount = items.filter((e) => e.paid === "Paid").length;
  const unpaidCount = items.length - paidCount;

  return (
    <div>
      <button
        onClick={onBack}
        className="text-[13px] font-extrabold text-muted"
        aria-label="Back to More"
      >
        ‹ More
      </button>
      <div className="mt-1.5 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[34px] leading-tight">Expenses.</h1>
          <p className="mt-1 text-[13px] text-muted">
            {items.length === 0
              ? "Money out that isn't stock."
              : `${money(monthOut)} out this month${unpaid > 0 ? ` · ${money(unpaid)} unpaid` : ""}.`}
          </p>
        </div>
        <button onClick={() => setSheet({ mode: "new" })} className="btn btn-accent shrink-0">
          + Add
        </button>
      </div>

      <input
        className="field mt-4"
        placeholder="Search name or category…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search expenses"
      />

      <div className="mt-3 flex gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          const n = f.id === "Paid" ? paidCount : f.id === "Unpaid" ? unpaidCount : items.length;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className="rounded-full px-4 py-2 text-[12px] font-extrabold"
              style={{
                background: active ? "var(--ink)" : "var(--surface)",
                color: active ? "#fff" : "var(--ink)",
                border: "1px solid var(--line)",
              }}
              aria-pressed={active}
            >
              {f.label} · {n}
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        {loading ? (
          <div className="card animate-pulse p-8 text-center text-[13px] font-bold text-muted">
            Opening the book…
          </div>
        ) : error ? (
          <div className="card p-8 text-center">
            <div className="kicker">Something hiccuped</div>
            <p className="mt-2 text-[13px] font-bold">{error}</p>
            <button onClick={load} className="btn btn-dark mt-4">
              Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="card px-2 py-9 text-center">
            <div className="text-muted">
              <GlyphTray size={44} />
            </div>
            <p className="mx-auto mt-3 max-w-[250px] text-[13px] leading-relaxed text-muted">
              No expenses logged. Rent, airtime, transport — it all lives here.
            </p>
            <button onClick={() => setSheet({ mode: "new" })} className="btn btn-accent mt-4">
              Log your first expense
            </button>
          </div>
        ) : shown.length === 0 ? (
          <div className="card px-2 py-9 text-center">
            <p className="mx-auto max-w-[240px] text-[13px] leading-relaxed text-muted">
              Nothing matches. Try another search or filter.
            </p>
          </div>
        ) : (
          <div className="card px-4 py-1">
            {shown.map((e) => (
              <button
                key={e.id}
                onClick={() => setSheet({ mode: "view", expense: e })}
                className="flex w-full items-center gap-3 py-3 text-left"
                style={{ borderBottom: "1px solid var(--line)" }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold">{e.name}</span>
                  <span className="block text-[11px] text-muted">
                    {e.category} · {e.date ? formatDay(e.date) : "Undated"}
                    {e.paid === "Unpaid" ? " · unpaid" : ""}
                  </span>
                </span>
                <span className="tnum shrink-0 text-[13px] font-extrabold">
                  {money(e.amount)}
                </span>
              </button>
            ))}
          </div>
        )}
        {!loading && !error && items.length >= 200 && (
          <p className="mt-2.5 text-center text-[11px] text-muted">Showing the first 200.</p>
        )}
      </div>

      {(sheet.mode === "new" || sheet.mode === "view") && (
        <ExpenseSheet
          expense={sheet.mode === "view" ? sheet.expense : null}
          onClose={() => setSheet({ mode: "closed" })}
          onChanged={load}
        />
      )}
    </div>
  );
}