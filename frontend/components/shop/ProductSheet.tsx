"use client";

import { useState } from "react";
import { money } from "@/lib/format";
import { Sheet } from "../Sheet";
import {
  SHOP_CATEGORIES,
  ShopError,
  archiveProduct,
  createProduct,
  deleteProduct,
  stockState,
  tintFor,
  updateProduct,
  type Product,
} from "@/lib/shop";

export function ProductSheet({
  product,
  onClose,
  onChanged,
  onQuick,
  onTogglePin,
}: {
  product: Product | null; // null = new
  onClose: () => void;
  onChanged: () => void;
  onQuick: (p: Product) => void;
  onTogglePin: (p: Product) => void;
}) {
  const isNew = product === null;
  const [editing, setEditing] = useState(isNew);
  const [name, setName] = useState(product?.name || "");
  const [sku, setSku] = useState(product?.sku || "");
  const [category, setCategory] = useState(product?.category || "Other");
  const [price, setPrice] = useState(String(product?.price ?? ""));
  const [cost, setCost] = useState(String(product?.cost ?? ""));
  const [stock, setStock] = useState(String(product?.stock ?? ""));
  const [threshold, setThreshold] = useState(String(product?.reorder_at ?? ""));
  const [unit, setUnit] = useState(product?.unit || "");
  const [notes, setNotes] = useState(product?.notes || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [arming, setArming] = useState(false);
  const [archived, setArchived] = useState(product?.archived || false);

  const margin =
    Number(price) > 0 ? ((Number(price) - Number(cost || 0)) / Number(price)) * 100 : 0;

  async function save() {
    if (!name.trim() || !sku.trim()) {
      setError("Name and SKU are required.");
      return;
    }
    setBusy(true);
    setError(null);
    setConflict(false);
    try {
      const input: Record<string, unknown> = {
        name: name.trim(),
        sku: sku.trim(),
        category,
        price: Number(price) || 0,
        cost: Number(cost) || 0,
        stock: Math.max(0, Math.floor(Number(stock) || 0)),
        reorder_at: Math.max(0, Math.floor(Number(threshold) || 0)),
        unit: unit.trim() || null,
        notes: notes.trim() || null,
      };
      if (!isNew && product) input.expected_version = product.version;
      if (isNew) await createProduct(input);
      else if (product) await updateProduct(product.id, input);
      onChanged();
      onClose();
    } catch (e) {
      if (e instanceof ShopError && e.code === "VERSION_CONFLICT") setConflict(true);
      setError(e instanceof ShopError ? e.message : "Couldn't save — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!product) return;
    if (!arming) {
      setArming(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteProduct(product.id);
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof ShopError ? e.message : "Couldn't delete — try again.");
      setBusy(false);
    }
  }

  async function flipArchive() {
    if (!product) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await archiveProduct(product.id, !archived);
      setArchived(updated.archived);
      onChanged();
    } catch (e) {
      setError(e instanceof ShopError ? e.message : "Couldn't change that product.");
    } finally {
      setBusy(false);
    }
  }

  const st = product ? stockState(product) : "in";

  return (
    <Sheet
      kicker={isNew ? "New product" : product!.category}
      title={isNew ? "Add it to the shelf" : product!.name}
      onClose={onClose}
    >
      {!isNew && product && !editing && (
        <div>
          <div className="flex items-center gap-3">
            <span
              className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl font-display text-[20px] text-white"
              style={{ background: tintFor(product.category) }}
            >
              {product.name.substring(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="tnum font-display text-[24px]">{money(product.price)}</div>
              <div className="text-[12px] text-muted">
                {product.sku} · cost {money(product.cost)} ·{" "}
                {Number.isFinite(margin) ? margin.toFixed(0) : "0"}% margin
              </div>
            </div>
            <span
              className="tnum shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black"
              style={{
                background: st === "out" ? "var(--red)" : st === "low" ? "var(--accent)" : "var(--bg)",
                color: st === "in" ? "var(--ink)" : "#fff",
              }}
            >
              {st === "out" ? "Out of stock" : `${product.stock} on hand`}
            </span>
          </div>
          {(product.unit || product.notes) && (
            <p className="mt-3 text-[13px] leading-relaxed text-muted">
              {[product.unit && `Sold per ${product.unit}`, product.notes].filter(Boolean).join(" · ")}
            </p>
          )}
          {archived && (
            <p className="mt-2 text-[12px] font-extrabold" style={{ color: "var(--accent)" }}>
              Archived — hidden from pickers, history kept.
            </p>
          )}

          <div className="mt-4 flex flex-col gap-2">
            <button onClick={() => onQuick(product)} className="btn btn-accent w-full">
              Quick edit price & stock
            </button>
            <button onClick={() => setEditing(true)} className="btn btn-dark w-full">
              Edit all details
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onTogglePin(product)}
                className="btn border"
                style={{ borderColor: "var(--line)" }}
              >
                {product.pinned ? "Unsave" : "Save"}
              </button>
              <button
                onClick={flipArchive}
                disabled={busy}
                className="btn border"
                style={{ borderColor: "var(--line)" }}
              >
                {archived ? "Unarchive" : "Archive"}
              </button>
            </div>
          </div>

          {error && (
            <p className="mt-3 text-[13px] font-bold" style={{ color: "var(--red)" }}>
              {error}
            </p>
          )}
          <button
            onClick={remove}
            disabled={busy}
            className="mt-3 w-full py-2 text-[12px] font-extrabold underline"
            style={{ color: "var(--red)" }}
          >
            {arming ? (busy ? "Removing…" : "Tap again to remove") : "Remove this product"}
          </button>
        </div>
      )}

      {(isNew || editing) && (
        <div>
          <label className="kicker block">Name</label>
          <input className="field mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Coca-Cola 500ml" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label className="kicker block">SKU</label>
              <input className="field mt-1.5" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. CC-500" />
            </div>
            <div>
              <label className="kicker block">Category</label>
              <select className="field mt-1.5" value={category} onChange={(e) => setCategory(e.target.value)}>
                {SHOP_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label className="kicker block">Selling price (K)</label>
              <input className="field tnum mt-1.5" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div>
              <label className="kicker block">Cost price (K)</label>
              <input className="field tnum mt-1.5" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>
          </div>
          <p className="mt-1.5 text-[12px] text-muted">
            {Number.isFinite(margin) ? margin.toFixed(1) : "0.0"}% gross margin
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label className="kicker block">Stock on hand</label>
              <input className="field tnum mt-1.5" inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} />
            </div>
            <div>
              <label className="kicker block">Low-stock at</label>
              <input className="field tnum mt-1.5" inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
            </div>
          </div>
          <label className="kicker mt-3 block">Sold per (optional)</label>
          <input className="field mt-1.5" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. bottle, kg, pack" />
          <label className="kicker mt-3 block">Notes (optional)</label>
          <input className="field mt-1.5" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering" />

          {error && (
            <p className="mt-3 text-[13px] font-bold" style={{ color: "var(--red)" }}>
              {error}
            </p>
          )}
          {conflict ? (
            <button
              onClick={() => {
                onChanged();
                onClose();
              }}
              className="btn btn-dark mt-4 w-full"
            >
              Close & reload the latest
            </button>
          ) : (
            <button onClick={save} disabled={busy} className="btn btn-accent mt-4 w-full">
              {busy ? "Saving…" : isNew ? "Add product" : "Save changes"}
            </button>
          )}
          {!isNew && (
            <button onClick={() => setEditing(false)} className="mt-2 w-full py-2 text-[12px] font-extrabold text-muted underline">
              Back to details
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}