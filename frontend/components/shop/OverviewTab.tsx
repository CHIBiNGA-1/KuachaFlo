"use client";

import { useResync } from "@/lib/offline/hooks";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  Boxes,
  ClipboardList,
  PackagePlus,
  Plus,
  TriangleAlert,
} from "lucide-react";
import { greeting } from "@/lib/format";
import { ShopError, getOverview, stockState, type Overview, type Product } from "@/lib/shop";
import { ProductPhoto } from "../inventory/ProductPhoto";

/** The first screen of the day. Deliberately shelf-first rather than
 * money-first: this is the view most likely to be open on a counter with
 * customers beside it, and "what do I need to reorder" is both the more
 * useful question and the safer one to have on screen. Revenue lives one
 * tap away in Reports, where you go on purpose. */
export function OverviewTab({
  shopName,
  onLowStock,
  onOpenInventory,
  onNewSale,
  onRestock,
  onOpenOrders,
}: {
  shopName?: string;
  onLowStock: () => void;
  onOpenInventory?: () => void;
  onNewSale?: () => void;
  onRestock?: (p: Product) => void;
  onOpenOrders?: () => void;
}) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getOverview());
    } catch (e) {
      setError(e instanceof ShopError ? e.message : "Couldn't load your shop — try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useResync(load);

  const attention = data ? data.low_stock.length + data.out_of_stock_count : 0;

  return (
    <div className="shelf">
      {/* ── Greeting ────────────────────────────────────────────────── */}
      <div>
        <div className="kicker">{greeting()}</div>
        <h1 className="mt-1 font-display text-[30px] leading-tight tracking-tight">
          {shopName || "Your shop"}
        </h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          {loading
            ? "Having a look around…"
            : attention === 0
              ? "Everything's stocked. Nothing needs you right now."
              : `${attention} ${attention === 1 ? "product needs" : "products need"} restocking.`}
        </p>
      </div>

      {/* ── Quick actions ───────────────────────────────────────────── */}
      <div className="mt-6 flex flex-wrap gap-2.5">
        <button className="btn btn-accent" onClick={() => onNewSale?.()}>
          <Plus size={15} />
          Ring up a sale
        </button>
        <button className="btn" onClick={() => onOpenInventory?.()}>
          <Boxes size={15} />
          Open the shelf
        </button>
        {attention > 0 && (
          <button className="btn" onClick={onLowStock}>
            <TriangleAlert size={15} />
            Review {attention} low
          </button>
        )}
      </div>

      {error ? (
        <div className="card mt-6 p-8 text-center">
          <p className="text-[13px] text-muted">{error}</p>
          <button className="btn mt-4" onClick={load}>
            Try again
          </button>
        </div>
      ) : loading ? (
        <div className="mt-6 grid gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-2xl"
              style={{ height: 96, background: "var(--surface-2)" }}
            />
          ))}
        </div>
      ) : (
        <>
          {/* ── Shelf health ──────────────────────────────────────── */}
          <div className="shelf-snapshot mt-6">
            <button onClick={() => onOpenInventory?.()}>
              <span className="snap-icon">
                <Boxes size={17} />
              </span>
              <span className="snap-text">
                <strong>{data ? data.low_stock.length + data.out_of_stock_count : 0}</strong>
                <small>Need a look</small>
              </span>
            </button>
            <button onClick={onLowStock}>
              <span className="snap-icon" style={{ color: data?.low_stock.length ? "var(--amber)" : undefined }}>
                <TriangleAlert size={17} />
              </span>
              <span className="snap-text">
                <strong style={{ color: data?.low_stock.length ? "var(--amber)" : undefined }}>
                  {data?.low_stock.length ?? 0}
                </strong>
                <small>Running low</small>
              </span>
            </button>
            <button onClick={onLowStock}>
              <span className="snap-icon" style={{ color: data?.out_of_stock_count ? "var(--red)" : undefined }}>
                <PackagePlus size={17} />
              </span>
              <span className="snap-text">
                <strong style={{ color: data?.out_of_stock_count ? "var(--red)" : undefined }}>
                  {data?.out_of_stock_count ?? 0}
                </strong>
                <small>Out of stock</small>
              </span>
            </button>
            <button onClick={() => onOpenOrders?.()}>
              <span className="snap-icon">
                <ClipboardList size={17} />
              </span>
              <span className="snap-text">
                <strong>{data?.pending_orders ?? 0}</strong>
                <small>Orders open</small>
              </span>
            </button>
          </div>

          {/* ── Needs restocking ──────────────────────────────────── */}
          <section className="mt-8">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-[19px] tracking-tight">Needs restocking</h2>
                <p className="mt-0.5 text-[12px] text-muted">
                  The shelf, sorted by what runs out first.
                </p>
              </div>
              {data && data.low_stock.length > 0 && (
                <button
                  className="text-[12px] font-bold"
                  style={{ color: "var(--accent)" }}
                  onClick={onLowStock}
                >
                  See all
                </button>
              )}
            </div>

            {!data || data.low_stock.length === 0 ? (
              <div className="card mt-4 flex items-center gap-4 p-6">
                <div
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
                  style={{ background: "var(--accent-wash)", color: "var(--green)" }}
                >
                  <Boxes size={19} />
                </div>
                <div>
                  <strong className="text-[13.5px]">Nothing's running low</strong>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
                    Every product is above its reorder point. This is the good state.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-4 grid gap-2.5">
                {data.low_stock.slice(0, 6).map((p) => {
                  const state = stockState(p);
                  return (
                    <div key={p.id} className="card flex items-center gap-3.5 p-3">
                      <span className="row-photo">
                        <ProductPhoto product={p} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-semibold">{p.name}</div>
                        <div
                          className="mt-0.5 text-[11.5px] font-semibold tnum"
                          style={{ color: state === "out" ? "var(--red)" : "var(--amber)" }}
                        >
                          {state === "out" ? "None left" : `Only ${p.stock} left`}
                          {p.unit ? ` ${p.unit}` : ""}
                          <span className="font-normal text-muted">
                            {" "}· reorder at {p.reorder_at}
                          </span>
                        </div>
                      </div>
                      <button
                        className="btn shrink-0"
                        onClick={() => onRestock?.(p)}
                        aria-label={`Restock ${p.name}`}
                      >
                        <PackagePlus size={14} />
                        <span className="hidden sm:inline">Restock</span>
                        <ArrowUpRight size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Moving fastest ────────────────────────────────────── */}
          {data && data.top_products.length > 0 && (
            <section className="mt-8">
              <h2 className="font-display text-[19px] tracking-tight">Moving fastest</h2>
              <p className="mt-0.5 text-[12px] text-muted">
                Most units sold this week — worth keeping deep.
              </p>
              <div className="card mt-4 divide-y" style={{ borderColor: "var(--line)" }}>
                {data.top_products.slice(0, 5).map((t, i) => (
                  <div
                    key={t.name}
                    className="flex items-center gap-3 p-3.5"
                    style={{ borderColor: "var(--line)" }}
                  >
                    <span
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                      style={{ background: "var(--accent-wash)", color: "var(--accent-deep)" }}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{t.name}</span>
                    <span className="tnum shrink-0 text-[12.5px] font-bold text-muted">
                      {t.quantity} sold
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
