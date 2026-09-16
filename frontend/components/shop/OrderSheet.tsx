"use client";

import { useMemo, useState } from "react";
import { formatDay, money } from "@/lib/format";
import { Sheet } from "../Sheet";
import {
  DONE_STATUS,
  OPEN_STATUS,
  ORDER_STATUSES,
  SHOP_CHANNELS,
  SHOP_PAYMENTS,
  ShopError,
  cancelOrder,
  createOrder,
  tintFor,
  tintForName,
  updateOrder,
  type Order,
  type OrderKind,
  type Product,
} from "@/lib/shop";

type Line = { product_id: string; quantity: number };

const today = () => new Date().toISOString().slice(0, 10);

export function OrderSheet({
  kind,
  order,
  products,
  parties,
  onClose,
  onChanged,
}: {
  kind: OrderKind;
  order: Order | null; // null = new
  products: Product[];
  parties: { id: string; name: string }[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const isNew = order === null;
  const isSale = kind === "sale";
  const [editing, setEditing] = useState(isNew);
  const [party, setParty] = useState(order?.party_name || "");
  const [partyPick, setPartyPick] = useState(false);
  const [status, setStatus] = useState(
    order?.status || (isSale ? DONE_STATUS.sale : OPEN_STATUS.purchase)
  );
  const [channel, setChannel] = useState(order?.channel || "Retail");
  const [payment, setPayment] = useState(order?.payment || "Paid");
  const [date, setDate] = useState(order?.occurred_on || today());
  const [due, setDue] = useState(order?.due_on || "");
  const [notes, setNotes] = useState(order?.notes || "");
  const [lines, setLines] = useState<Line[]>(
    order ? order.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })) : []
  );
  const [picking, setPicking] = useState(false);
  const [pickQuery, setPickQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [arming, setArming] = useState(false);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const unitPrice = (p: Product) => (isSale ? p.price : p.cost);
  const estimate = lines.reduce(
    (sum, l) => sum + (byId.get(l.product_id) ? unitPrice(byId.get(l.product_id)!) * l.quantity : 0),
    0
  );
  const pickerList = useMemo(() => {
    const q = pickQuery.trim().toLowerCase();
    const used = new Set(lines.map((l) => l.product_id));
    return products.filter(
      (p) => !used.has(p.id) && (!q || `${p.name} ${p.sku}`.toLowerCase().includes(q))
    );
  }, [products, lines, pickQuery]);

  function bump(id: string, d: number) {
    setLines((prev) =>
      prev.map((l) =>
        l.product_id === id ? { ...l, quantity: Math.max(1, l.quantity + d) } : l
      )
    );
  }

  async function save() {
    if (lines.length === 0) {
      setError(isSale ? "Add at least one product to ring up." : "Add at least one product to order.");
      return;
    }
    setBusy(true);
    setError(null);
    setConflict(false);
    const input: Record<string, unknown> = {
      [isSale ? "customer" : "supplier"]: party.trim(),
      status,
      channel,
      payment,
      date,
      notes: notes.trim(),
      items: lines,
    };
    if (!isSale) input.due_date = due || null;
    if (!isNew && order) input.expected_version = order.version;
    try {
      if (isNew) await createOrder(kind, input);
      else if (order) await updateOrder(kind, order.id, input);
      onChanged();
      onClose();
    } catch (e) {
      if (e instanceof ShopError && e.code === "VERSION_CONFLICT") setConflict(true);
      setError(e instanceof ShopError ? e.message : "Couldn't save — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function advance() {
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      await updateOrder(kind, order.id, {
        status: isSale ? DONE_STATUS.sale : DONE_STATUS.purchase,
        expected_version: order.version,
      });
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof ShopError ? e.message : "Couldn't update — try again.");
      setBusy(false);
    }
  }

  async function flipPayment() {
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      await updateOrder(kind, order.id, {
        payment: order.payment === "Paid" ? "Unpaid" : "Paid",
        expected_version: order.version,
      });
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof ShopError ? e.message : "Couldn't update — try again.");
      setBusy(false);
    }
  }

  async function cancel() {
    if (!order) return;
    if (!arming) {
      setArming(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await cancelOrder(kind, order.id);
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof ShopError ? e.message : "Couldn't cancel — try again.");
      setBusy(false);
    }
  }

  const cancelled = order?.status === "Cancelled";
  const isOpen = order?.status === (isSale ? OPEN_STATUS.sale : OPEN_STATUS.purchase);

  const statusPill = (s: string) => (
    <span
      className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black"
      style={{
        background:
          s === (isSale ? DONE_STATUS.sale : DONE_STATUS.purchase)
            ? "var(--ink)"
            : s === "Cancelled"
              ? "var(--red)"
              : "var(--accent)",
        color: "#fff",
      }}
    >
      {s}
    </span>
  );

  return (
    <Sheet
      kicker={isNew ? (isSale ? "New sale" : "New purchase order") : order!.reference}
      title={
        isNew
          ? isSale
            ? "Ring it up"
            : "Stock the shelf"
          : order!.party_name || (isSale ? "Walk-in customer" : "Supplier")
      }
      onClose={onClose}
    >
      {!isNew && order && !editing && (
        <div>
          <div className="flex items-center justify-between gap-3">
            {statusPill(order.status)}
            <span className="tnum font-display text-[24px]">{money(order.amount_total)}</span>
          </div>

          <div className="mt-3">
            {order.items.map((i) => {
              const p = byId.get(i.product_id);
              return (
                <div key={i.product_id} className="flex items-center gap-3 py-2.5">
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[12px] font-black text-white"
                    style={{ background: tintFor(p?.category || "Other") }}
                  >
                    {i.name.substring(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold">{i.name}</span>
                    <span className="tnum block text-[11px] text-muted">
                      ×{i.quantity} @ {money(i.price)}
                    </span>
                  </span>
                  <span className="tnum shrink-0 text-[13px] font-extrabold">
                    {money(i.price * i.quantity)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-2 text-[12.5px] leading-relaxed text-muted">
            {isSale ? `Channel: ${order.channel}` : order.due_on ? `Expected: ${formatDay(order.due_on)}` : "No delivery date set"}
            {" · "}
            {order.occurred_on ? formatDay(order.occurred_on) : "Undated"}
            {order.notes ? ` · ${order.notes}` : ""}
          </div>
          {cancelled && (
            <p className="mt-2 text-[12px] font-extrabold" style={{ color: "var(--red)" }}>
              Cancelled — stock reversed, history kept.
            </p>
          )}

          {!cancelled && (
            <div className="mt-4 flex flex-col gap-2">
              {isOpen && (
                <button onClick={advance} disabled={busy} className="btn btn-accent w-full">
                  {isSale ? "Mark completed" : "Mark received"}
                </button>
              )}
              <button onClick={() => setEditing(true)} className="btn btn-dark w-full">
                Edit
              </button>
              <button
                onClick={flipPayment}
                disabled={busy}
                className="btn border"
                style={{ borderColor: "var(--line)" }}
              >
                {order.payment === "Paid" ? "Mark unpaid" : "Mark paid"}
              </button>
            </div>
          )}

          {error && (
            <p className="mt-3 text-[13px] font-bold" style={{ color: "var(--red)" }}>
              {error}
            </p>
          )}
          {!cancelled && (
            <button
              onClick={cancel}
              disabled={busy}
              className="mt-3 w-full py-2 text-[12px] font-extrabold underline"
              style={{ color: "var(--red)" }}
            >
              {arming ? (busy ? "Cancelling…" : "Tap again to cancel this order") : "Cancel this order"}
            </button>
          )}
        </div>
      )}

      {(isNew || editing) && (
        <div>
          <div className="flex items-baseline justify-between">
            <label className="kicker block">{isSale ? "Customer" : "Supplier"}</label>
            <button
              onClick={() => setPartyPick((v) => !v)}
              className="text-[12px] font-extrabold text-muted underline"
            >
              {partyPick ? "Type instead" : "From the book"}
            </button>
          </div>
          {partyPick ? (
            <div className="mt-1.5 max-h-44 overflow-y-auto rounded-2xl border p-1.5" style={{ borderColor: "var(--line)" }}>
              {parties.length === 0 ? (
                <p className="p-3 text-center text-[12px] text-muted">
                  {isSale
                    ? "No customers in the book yet — add them under More."
                    : "No suppliers in the book yet — add them under More."}
                </p>
              ) : (
                parties.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      setParty(b.name);
                      setPartyPick(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl p-2 text-left"
                  >
                    <span
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-black text-white"
                      style={{ background: tintForName(b.name) }}
                    >
                      {b.name.substring(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-bold">{b.name}</span>
                  </button>
                ))
              )}
            </div>
          ) : (
            <input
              className="field mt-1.5"
              value={party}
              onChange={(e) => setParty(e.target.value)}
              placeholder={isSale ? "Walk-in customer" : "Supplier name"}
            />
          )}

          <div className="kicker mt-4">Products</div>
          {lines.length === 0 ? (
            <p className="rounded-2xl p-4 text-center text-[12.5px] text-muted" style={{ background: "var(--bg)" }}>
              {isSale ? "Your next sale is just a product away." : "Your next delivery is just a product away."}
            </p>
          ) : (
            <div className="mt-1">
              {lines.map((l) => {
                const p = byId.get(l.product_id);
                if (!p) return null;
                return (
                  <div key={l.product_id} className="flex items-center gap-2.5 py-2">
                    <span
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[12px] font-black text-white"
                      style={{ background: tintFor(p.category) }}
                    >
                      {p.name.substring(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold">{p.name}</span>
                      <span className="tnum block text-[11px] text-muted">{money(unitPrice(p))} each</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => bump(l.product_id, -1)}
                        className="grid h-7 w-7 place-items-center rounded-lg text-[15px] font-black"
                        style={{ background: "var(--bg)" }}
                        aria-label={`Decrease ${p.name} quantity`}
                      >
                        −
                      </button>
                      <span className="tnum w-7 text-center text-[13px] font-extrabold">{l.quantity}</span>
                      <button
                        onClick={() => bump(l.product_id, 1)}
                        className="grid h-7 w-7 place-items-center rounded-lg text-[15px] font-black"
                        style={{ background: "var(--bg)" }}
                        aria-label={`Increase ${p.name} quantity`}
                      >
                        +
                      </button>
                      <button
                        onClick={() => setLines((prev) => prev.filter((x) => x.product_id !== l.product_id))}
                        className="px-1 text-[11px] font-extrabold text-muted underline"
                        aria-label={`Remove ${p.name}`}
                      >
                        Cut
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {!picking ? (
            <button
              onClick={() => setPicking(true)}
              className="btn border mt-2 w-full"
              style={{ borderColor: "var(--line)" }}
            >
              + Add a product
            </button>
          ) : (
            <div className="mt-2 rounded-2xl border p-3" style={{ borderColor: "var(--line)" }}>
              <input
                className="field"
                placeholder="Search the shelf…"
                value={pickQuery}
                onChange={(e) => setPickQuery(e.target.value)}
                aria-label="Search products"
              />
              <div className="mt-1 max-h-52 overflow-y-auto">
                {pickerList.length === 0 ? (
                  <p className="p-3 text-center text-[12px] text-muted">
                    {products.length === 0
                      ? "The shelf is empty — add products in Stock first."
                      : "Everything already on the ticket, or nothing matches."}
                  </p>
                ) : (
                  pickerList.slice(0, 30).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setLines((prev) => [...prev, { product_id: p.id, quantity: 1 }]);
                        setPickQuery("");
                        setPicking(false);
                      }}
                      className="flex w-full items-center gap-2.5 py-2 text-left"
                    >
                      <span
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[11px] font-black text-white"
                        style={{ background: tintFor(p.category) }}
                      >
                        {p.name.substring(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-bold">{p.name}</span>
                      <span className="tnum shrink-0 text-[12px] text-muted">
                        {money(unitPrice(p))} · {p.stock} in
                      </span>
                    </button>
                  ))
                )}
              </div>
              <button
                onClick={() => {
                  setPicking(false);
                  setPickQuery("");
                }}
                className="mt-1 w-full py-1.5 text-[12px] font-extrabold text-muted underline"
              >
                Done adding
              </button>
            </div>
          )}

          <div className="mt-3 flex items-baseline justify-between">
            <span className="kicker">Estimated total</span>
            <span className="tnum font-display text-[22px]">{money(estimate)}</span>
          </div>
          <p className="text-right text-[11px] text-muted">The till computes the final at save.</p>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label className="kicker block">Status</label>
              <select className="field mt-1.5" value={status} onChange={(e) => setStatus(e.target.value)}>
                {ORDER_STATUSES[kind].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="kicker block">Payment</label>
              <select className="field mt-1.5" value={payment} onChange={(e) => setPayment(e.target.value)}>
                {SHOP_PAYMENTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {isSale ? (
              <div>
                <label className="kicker block">Channel</label>
                <select className="field mt-1.5" value={channel} onChange={(e) => setChannel(e.target.value)}>
                  {SHOP_CHANNELS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="kicker block">Expected delivery</label>
                <input className="field mt-1.5" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              </div>
            )}
            <div>
              <label className="kicker block">Order date</label>
              <input className="field mt-1.5" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <label className="kicker mt-3 block">Notes (optional)</label>
          <input
            className="field mt-1.5"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything worth remembering"
          />

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
              {busy ? "Saving…" : isNew ? (isSale ? "Ring up the sale" : "Place the order") : "Save changes"}
            </button>
          )}
          {!isNew && (
            <button
              onClick={() => setEditing(false)}
              className="mt-2 w-full py-2 text-[12px] font-extrabold text-muted underline"
            >
              Back to details
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}