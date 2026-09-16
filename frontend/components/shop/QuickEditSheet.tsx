"use client";

import { useState } from "react";
import { money } from "@/lib/format";
import { Sheet } from "../Sheet";
import { ShopError, tintFor, updateProduct, type Product } from "@/lib/shop";

export function QuickEditSheet({
  product,
  onClose,
  onChanged,
  onFullEdit,
}: {
  product: Product;
  onClose: () => void;
  onChanged: () => void;
  onFullEdit: (p: Product) => void;
}) {
  const [price, setPrice] = useState(String(product.price || 0));
  const [stock, setStock] = useState(String(product.stock || 0));
  const [threshold, setThreshold] = useState(String(product.reorder_at || 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const margin =
    Number(price) > 0 ? ((Number(price) - (product.cost || 0)) / Number(price)) * 100 : 0;
  const stockN = Math.max(0, Math.floor(Number(stock) || 0));
  const thresholdN = Math.max(0, Math.floor(Number(threshold) || 0));

  const tip =
    stockN === 0
      ? "Out of stock. Create a purchase order to bring this product back."
      : stockN <= thresholdN
        ? "This product will appear in Needs attention until stock is above its threshold."
        : "Looking good. This product is above its low-stock threshold.";

  async function save() {
    setBusy(true);
    setError(null);
    // Only changed fields travel — and a stock change carries the count
    // this card opened with, so collisions fail loudly, never silently.
    const changes: Record<string, unknown> = {};
    if (Number(price) !== (product.price || 0)) changes.price = Number(price) || 0;
    if (thresholdN !== (product.reorder_at || 0)) changes.reorder_at = thresholdN;
    if (stockN !== (product.stock || 0)) {
      changes.stock = stockN;
      changes.expected_stock = product.stock || 0;
    }
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    try {
      await updateProduct(product.id, changes);
      onChanged();
      onClose();
    } catch (e) {
      if (e instanceof ShopError && e.code === "STOCK_CHANGED") {
        setStale(true);
        onChanged();
      }
      setError(e instanceof ShopError ? e.message : "Couldn't save — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet kicker="The essentials" title="A quick little update" onClose={onClose}>
      <div className="flex items-center gap-3">
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-[15px] font-black text-white"
          style={{ background: tintFor(product.category) }}
        >
          {product.name.substring(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[15px] font-extrabold">{product.name}</div>
          <div className="text-[12px] text-muted">
            {product.category} · {product.unit || "Per unit"}
          </div>
        </div>
      </div>

      <label className="kicker mt-4 block">Selling price (K)</label>
      <input
        className="field tnum mt-1.5"
        inputMode="decimal"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
      />
      <p className="mt-1.5 text-[12px] text-muted">
        Cost {money(product.cost || 0)} · {Number.isFinite(margin) ? margin.toFixed(1) : "0.0"}% gross margin
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <label className="kicker block">Stock on hand</label>
          <input
            className="field tnum mt-1.5"
            inputMode="numeric"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
          />
        </div>
        <div>
          <label className="kicker block">Low-stock at</label>
          <input
            className="field tnum mt-1.5"
            inputMode="numeric"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
          />
        </div>
      </div>

      <p className="mt-3 rounded-2xl p-3.5 text-[12.5px] leading-relaxed" style={{ background: "var(--bg)" }}>
        {tip}
      </p>

      {error && (
        <p className="mt-3 text-[13px] font-bold" style={{ color: "var(--red)" }}>
          {error}
        </p>
      )}

      <button
        onClick={() => onFullEdit(product)}
        disabled={busy}
        className="mt-3 w-full py-1 text-[12px] font-extrabold text-muted underline"
      >
        Edit all product details →
      </button>

      {stale ? (
        <button onClick={onClose} className="btn btn-dark mt-2 w-full">
          Close & use the latest count
        </button>
      ) : (
        <button onClick={save} disabled={busy} className="btn btn-accent mt-2 w-full">
          {busy ? "Saving…" : "Save changes"}
        </button>
      )}
    </Sheet>
  );
}