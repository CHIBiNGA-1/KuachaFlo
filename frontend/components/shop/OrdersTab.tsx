"use client";

import { useResync } from "@/lib/offline/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDay, money } from "@/lib/format";
import {
  DONE_STATUS,
  OPEN_STATUS,
  ShopError,
  listCustomers,
  listOrders,
  listProducts,
  listSuppliers,
  type Order,
  type OrderKind,
  type Product,
} from "@/lib/shop";
import { GlyphCart, GlyphTray } from "../Glyph";
import { OrderSheet } from "./OrderSheet";

type Filter = "all" | "open" | "done";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "open", label: "Open" },
  { id: "done", label: "Done" },
];

const COPY: Record<
  OrderKind,
  { title: string; sub: string; empty: string; new: string; first: string }
> = {
  sale: {
    title: "Sales.",
    sub: "Money in, referenced.",
    empty: "No sales yet. Your first one is just a product away.",
    new: "New sale",
    first: "Ring up your first sale",
  },
  purchase: {
    title: "Buying.",
    sub: "Stock in, dues true.",
    empty: "No purchase orders yet. Your first delivery is just a product away.",
    new: "New order",
    first: "Place your first order",
  },
};

export function OrdersTab({ kind }: { kind: OrderKind }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [parties, setParties] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<
    { mode: "closed" } | { mode: "new" } | { mode: "view"; order: Order }
  >({ mode: "closed" });

  const copy = COPY[kind];

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [o, p, book] = await Promise.all([
        listOrders(kind),
        listProducts(),
        kind === "sale" ? listCustomers() : listSuppliers(),
      ]);
      setOrders(o);
      setProducts(p);
      setParties(book.map((b) => ({ id: b.id, name: b.name })));
    } catch (e) {
      setError(e instanceof ShopError ? e.message : "Couldn't load — try again.");
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    load();
  }, [load]);
  useResync(load);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter === "open" && o.status !== OPEN_STATUS[kind]) return false;
      if (filter === "done" && o.status !== DONE_STATUS[kind]) return false;
      if (q && !`${o.reference} ${o.party_name}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [orders, filter, query, kind]);

  const openCount = orders.filter((o) => o.status === OPEN_STATUS[kind]).length;
  const doneCount = orders.filter((o) => o.status === DONE_STATUS[kind]).length;

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[34px] leading-tight">{copy.title}</h1>
          <p className="mt-1 text-[13px] text-muted">{copy.sub}</p>
        </div>
        <button onClick={() => setSheet({ mode: "new" })} className="btn btn-accent shrink-0">
          + {copy.new.replace("New ", "")}
        </button>
      </div>

      <input
        className="field mt-4"
        placeholder={kind === "sale" ? "Search reference or customer…" : "Search reference or supplier…"}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search orders"
      />

      <div className="mt-3 flex gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          const n = f.id === "open" ? openCount : f.id === "done" ? doneCount : orders.length;
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
        ) : orders.length === 0 ? (
          <div className="card px-2 py-9 text-center">
            <div className="text-muted">
              {kind === "sale" ? <GlyphCart size={44} /> : <GlyphTray size={44} />}
            </div>
            <p className="mx-auto mt-3 max-w-[250px] text-[13px] leading-relaxed text-muted">
              {copy.empty}
            </p>
            <button onClick={() => setSheet({ mode: "new" })} className="btn btn-accent mt-4">
              {copy.first}
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
            {shown.map((o) => (
              <button
                key={o.id}
                onClick={() => setSheet({ mode: "view", order: o })}
                className="flex w-full items-center gap-3 py-3 text-left"
                style={{ borderBottom: "1px solid var(--line)" }}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{
                    background:
                      o.status === DONE_STATUS[kind]
                        ? "var(--ink)"
                        : o.status === "Cancelled"
                          ? "var(--red)"
                          : "var(--accent)",
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold">
                    {o.reference} · {o.party_name}
                  </span>
                  <span className="block text-[11px] text-muted">
                    {o.occurred_on ? formatDay(o.occurred_on) : "Undated"} · {o.status}
                    {o.payment === "Unpaid" ? " · unpaid" : ""}
                  </span>
                </span>
                <span className="tnum shrink-0 text-[13px] font-extrabold">
                  {money(o.amount_total)}
                </span>
              </button>
            ))}
          </div>
        )}
        {!loading && !error && orders.length >= 200 && (
          <p className="mt-2.5 text-center text-[11px] text-muted">Showing the first 200.</p>
        )}
      </div>

      {(sheet.mode === "new" || sheet.mode === "view") && (
        <OrderSheet
          kind={kind}
          order={sheet.mode === "view" ? sheet.order : null}
          products={products}
          parties={parties}
          onClose={() => setSheet({ mode: "closed" })}
          onChanged={load}
        />
      )}
    </div>
  );
}