"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { money } from "@/lib/format";
import { CAT_COLORS, buildChart, type ChartRow } from "@/lib/chart";
import {
  DONE_STATUS,
  ShopError,
  listExpenses,
  listOrders,
  listProducts,
  stockState,
  tintForName,
  type Order,
  type Product,
  type ShopExpense,
} from "@/lib/shop";
import { GlyphChart } from "../Glyph";

type Period = 7 | 30 | 90;

const PERIODS: { id: Period; label: string }[] = [
  { id: 7, label: "7 days" },
  { id: 30, label: "30 days" },
  { id: 90, label: "90 days" },
];

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function windowDates(days: number, backWindows = 0): string[] {
  const out: string[] = [];
  const end = new Date();
  end.setDate(end.getDate() - backWindows * days);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    out.push(isoDay(d));
  }
  return out;
}

function growthText(cur: number, prev: number, period: Period): string {
  if (prev <= 0) return cur > 0 ? "new this period" : "no sales either period";
  const pct = Math.round(((cur - prev) / prev) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}% vs prior ${period} days`;
}

function saveCsv(name: string, rows: (string | number)[][]) {
  const body = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function ReportsTab({
  onBack,
  onOpenCustomers,
  onReviewInventory,
}: {
  onBack: () => void;
  onOpenCustomers: () => void;
  onReviewInventory: () => void;
}) {
  const [sales, setSales] = useState<Order[]>([]);
  const [expenses, setExpenses] = useState<ShopExpense[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>(30);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, e, p] = await Promise.all([listOrders("sale"), listExpenses(), listProducts()]);
      setSales(s);
      setExpenses(e);
      setProducts(p);
    } catch (err) {
      setError(err instanceof ShopError ? err.message : "Couldn't load — try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const dates = windowDates(period);
    const inWin = new Set(dates);
    const inPrev = new Set(windowDates(period, 1));
    const done = sales.filter((o) => o.status === DONE_STATUS.sale);
    const cur = done.filter((o) => o.occurred_on && inWin.has(o.occurred_on));
    const prev = done.filter((o) => o.occurred_on && inPrev.has(o.occurred_on));
    const revenue = cur.reduce((s, o) => s + o.amount_total, 0);
    const cogs = cur.reduce(
      (s, o) => s + o.items.reduce((t, i) => t + i.cost * i.quantity, 0),
      0
    );
    const profit = revenue - cogs;
    const prevRevenue = prev.reduce((s, o) => s + o.amount_total, 0);
    const prevProfit =
      prevRevenue -
      prev.reduce((s, o) => s + o.items.reduce((t, i) => t + i.cost * i.quantity, 0), 0);
    const expWin = expenses.filter((e) => e.date && inWin.has(e.date));
    const expTotal = expWin.reduce((s, e) => s + e.amount, 0);
    const net = profit - expTotal;
    const margin = revenue ? (profit / revenue) * 100 : 0;
    const chart = buildChart(
      cur
        .filter((o) => o.occurred_on)
        .map((o) => ({ occurred_on: o.occurred_on!, amount: o.amount_total }) as ChartRow),
      dates
    );
    const groups = new Map<string, { revenue: number; orders: number }>();
    for (const o of cur) {
      const name = o.party_name || "Walk-in customer";
      const g = groups.get(name) || { revenue: 0, orders: 0 };
      groups.set(name, { revenue: g.revenue + o.amount_total, orders: g.orders + 1 });
    }
    const customers = Array.from(groups).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5);
    const expGroups = new Map<string, number>();
    for (const e of expWin) expGroups.set(e.category, (expGroups.get(e.category) || 0) + e.amount);
    const expList = Array.from(expGroups).sort((a, b) => b[1] - a[1]);
    const lowCount = products.filter((p) => stockState(p) !== "in").length;
    return {
      revenue, cogs, profit, prevRevenue, prevProfit, expTotal, net, margin,
      chart, customers, expList, lowCount, cur, expWin,
    };
  }, [sales, expenses, products, period]);

  function download() {
    saveCsv(`shop-report-${period}d-${isoDay(new Date())}.csv`, [
      ["Line", "Amount (K)", `Last ${period} days`],
      ["Revenue", stats.revenue.toFixed(2), ""],
      ["Cost of goods sold", stats.cogs.toFixed(2), ""],
      ["Gross profit", stats.profit.toFixed(2), ""],
      ["Operating expenses", stats.expTotal.toFixed(2), ""],
      ["Net profit", stats.net.toFixed(2), ""],
      ["Completed orders", stats.cur.length, ""],
      ...stats.expList.map(([name, amount]) => [`Expense: ${name}`, amount.toFixed(2), ""]),
    ]);
  }

  const hasAnything = sales.length > 0 || expenses.length > 0;

  return (
    <div>
      <button
        onClick={onBack}
        className="text-[13px] font-extrabold text-muted"
        aria-label="Back to More"
      >
        ‹ More
      </button>
      <h1 className="mt-1.5 font-display text-[34px] leading-tight">Reports.</h1>
      <p className="mt-1 text-[13px] text-muted">Sales, costs, and profit.</p>

      {loading ? (
        <div className="card mt-4 animate-pulse p-8 text-center text-[13px] font-bold text-muted">
          Crunching the numbers…
        </div>
      ) : error ? (
        <div className="card mt-4 p-8 text-center">
          <div className="kicker">Something hiccuped</div>
          <p className="mt-2 text-[13px] font-bold">{error}</p>
          <button onClick={load} className="btn btn-dark mt-4">
            Try again
          </button>
        </div>
      ) : !hasAnything ? (
        <div className="card mt-4 px-2 py-9 text-center">
          <div className="text-muted">
            <GlyphChart size={44} />
          </div>
          <p className="mx-auto mt-3 max-w-[250px] text-[13px] leading-relaxed text-muted">
            No numbers to crunch yet — reports wake up after your first sale or expense.
          </p>
        </div>
      ) : (
        <div>
          <div className="mt-4 flex gap-2">
            {PERIODS.map((p) => {
              const active = period === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  className="rounded-full px-4 py-2 text-[12px] font-extrabold"
                  style={{
                    background: active ? "var(--ink)" : "var(--surface)",
                    color: active ? "#fff" : "var(--ink)",
                    border: "1px solid var(--line)",
                  }}
                  aria-pressed={active}
                >
                  {p.label}
                </button>
              );
            })}
            <button onClick={download} className="btn ml-auto">
              Export
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-3">
            <div className="card p-5">
              <div className="kicker">Revenue less cost of goods</div>
              <div className="mt-1 text-[15px] font-extrabold">Gross profit</div>
              <div className="tnum mt-1 font-display text-[30px]">{money(stats.profit)}</div>
              <div className="mt-1 text-[12px] font-bold text-muted">
                {growthText(stats.profit, stats.prevProfit, period)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="card p-4">
                <div className="kicker">This period</div>
                <div className="mt-1 text-[14px] font-extrabold">Expenses</div>
                <div className="tnum mt-1 font-display text-[22px]">{money(stats.expTotal)}</div>
              </div>
              <div className="card p-4">
                <div className="kicker">{stats.margin.toFixed(1)}% margin</div>
                <div className="mt-1 text-[14px] font-extrabold">Net profit</div>
                <div
                  className="tnum mt-1 font-display text-[22px]"
                  style={{ color: stats.net < 0 ? "var(--red)" : undefined }}
                >
                  {money(stats.net)}
                </div>
              </div>
            </div>
          </div>

          <div className="card mt-3 p-5">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-[15px] font-extrabold">Revenue trend</div>
              <div className="tnum text-[13px] font-bold text-muted">{money(stats.revenue)} total</div>
            </div>
            <div className="mt-1 text-[12px] text-muted">
              {growthText(stats.revenue, stats.prevRevenue, period)}
            </div>
            {stats.chart.hasData ? (
              <div className="mt-3">
                <div className="relative" style={{ height: 150 }}>
                  <div className="absolute inset-0 flex flex-col justify-between" aria-hidden>
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="w-full" style={{ borderTop: "1px solid var(--line)" }} />
                    ))}
                  </div>
                  <svg viewBox="0 0 700 180" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                    <defs>
                      <linearGradient id="revFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0" stopColor="var(--accent)" stopOpacity=".25" />
                        <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={stats.chart.area} fill="url(#revFill)" />
                    <path
                      d={stats.chart.line}
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="mt-1.5 flex justify-between text-[10px] font-bold text-muted">
                  {stats.chart.labels.map((l, i) => (
                    <span key={i}>{l}</span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="py-8 text-center text-[12px] text-muted">
                No completed sales in this period.
              </p>
            )}
          </div>

          <div className="card mt-3 p-5">
            <div className="text-[15px] font-extrabold">Profit & loss</div>
            <div className="mt-1 text-[12px] text-muted">Revenue, costs, and net profit.</div>
            <div className="mt-2">
              {[
                ["Total revenue", stats.revenue],
                ["Cost of goods sold", -stats.cogs],
                ["Gross profit", stats.profit],
                ["Operating expenses", -stats.expTotal],
              ].map(([label, amount]) => (
                <div key={String(label)} className="flex items-baseline justify-between py-1.5">
                  <span className="text-[13px] text-muted">{label}</span>
                  <span className="tnum text-[13px] font-extrabold">{money(Number(amount))}</span>
                </div>
              ))}
              <div
                className="mt-1 flex items-baseline justify-between py-2"
                style={{ borderTop: "1px solid var(--line)" }}
              >
                <span className="text-[14px] font-extrabold">Net profit</span>
                <span
                  className="tnum font-display text-[20px]"
                  style={{ color: stats.net < 0 ? "var(--red)" : undefined }}
                >
                  {money(stats.net)}
                </span>
              </div>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              Based on completed sales and recorded expenses. Figures exclude unrecorded taxes.
            </p>
          </div>

          <div className="card mt-3 p-5">
            <button onClick={onOpenCustomers} className="flex w-full items-center gap-2 text-left">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-extrabold">Most valuable customers</span>
                <span className="block text-[12px] text-muted">A good relationship is good for business.</span>
              </span>
              <span className="text-[16px] font-black text-muted">›</span>
            </button>
            {stats.customers.length === 0 ? (
              <p className="py-6 text-center text-[12px] text-muted">
                Relationships start with a sale — customer insights land after your first one.
              </p>
            ) : (
              <div className="mt-1">
                {stats.customers.map(([name, v], i) => (
                  <div key={name} className="flex items-center gap-2.5 py-2.5">
                    <span
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10px] font-black text-white"
                      style={{ background: tintForName(name) }}
                    >
                      {name.substring(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[12px] font-bold">{name}</span>
                        <span className="tnum shrink-0 text-[12px] font-black">{money(v.revenue)}</span>
                      </span>
                      <span className="block text-[10px] text-muted">
                        {v.orders} completed {v.orders === 1 ? "order" : "orders"}
                      </span>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full" style={{ background: "var(--bg)" }}>
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${stats.customers[0][1].revenue > 0 ? (v.revenue / stats.customers[0][1].revenue) * 100 : 0}%`,
                            background: CAT_COLORS[i % CAT_COLORS.length],
                          }}
                        />
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card mt-3 p-5">
            <div className="text-[15px] font-extrabold">Where your money goes</div>
            <div className="mt-1 text-[12px] text-muted">Operating expenses by category.</div>
            {stats.expList.length === 0 ? (
              <p className="py-6 text-center text-[12px] text-muted">
                A clean expense sheet — add expenses to see a breakdown here.
              </p>
            ) : (
              <div className="mt-1">
                {stats.expList.map(([cat, amount], i) => {
                  const pct = stats.expTotal > 0 ? Math.round((amount / stats.expTotal) * 100) : 0;
                  const color = CAT_COLORS[i % CAT_COLORS.length];
                  return (
                    <div key={cat} className="flex items-center gap-2.5 py-2.5">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[12px] font-bold">{cat}</span>
                          <span className="tnum shrink-0 text-[12px] text-muted">
                            {money(amount)} · {pct}%
                          </span>
                        </span>
                        <span className="mt-1 block h-1.5 overflow-hidden rounded-full" style={{ background: "var(--bg)" }}>
                          <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card mt-3 p-5">
            <div className="text-[15px] font-extrabold">A small action. A well-stocked tomorrow.</div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              {stats.lowCount > 0
                ? `${stats.lowCount} ${stats.lowCount === 1 ? "product is" : "products are"} running low. Restocking now keeps your bestsellers ready for the next customer.`
                : "Your shelves are looking healthy. Keep an eye on your bestsellers as demand grows."}
            </p>
            <button onClick={onReviewInventory} className="btn btn-dark mt-3 w-full">
              Review inventory →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}