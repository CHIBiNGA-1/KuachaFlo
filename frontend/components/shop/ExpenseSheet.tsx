"use client";

import { useState } from "react";
import { formatDay, money } from "@/lib/format";
import { Sheet } from "../Sheet";
import {
  SHOP_EXPENSE_CATEGORIES,
  SHOP_PAYMENT_METHODS,
  ShopError,
  createExpense,
  deleteExpense,
  updateExpense,
  type ShopExpense,
} from "@/lib/shop";

const today = () => new Date().toISOString().slice(0, 10);

export function ExpenseSheet({
  expense,
  onClose,
  onChanged,
}: {
  expense: ShopExpense | null; // null = new
  onClose: () => void;
  onChanged: () => void;
}) {
  const isNew = expense === null;
  const [editing, setEditing] = useState(isNew);
  const [name, setName] = useState(expense?.name || "");
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [category, setCategory] = useState(expense?.category || "Other");
  const [date, setDate] = useState(expense?.date || today());
  const [method, setMethod] = useState(expense?.method || "Cash");
  const [paid, setPaid] = useState(expense?.paid || "Paid");
  const [notes, setNotes] = useState(expense?.notes || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [arming, setArming] = useState(false);

  async function save() {
    if (!name.trim()) {
      setError("Give it a name — what was the money for?");
      return;
    }
    if (!(Number(amount) > 0)) {
      setError("Enter an amount above zero.");
      return;
    }
    setBusy(true);
    setError(null);
    const input: Record<string, unknown> = {
      name: name.trim(),
      amount: Number(amount),
      category,
      date,
      method,
      paid,
      notes: notes.trim(),
    };
    try {
      if (isNew) await createExpense(input);
      else if (expense) await updateExpense(expense.id, input);
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof ShopError ? e.message : "Couldn't save — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function flipPaid() {
    if (!expense) return;
    setBusy(true);
    setError(null);
    try {
      await updateExpense(expense.id, { paid: expense.paid === "Paid" ? "Unpaid" : "Paid" });
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof ShopError ? e.message : "Couldn't update — try again.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!expense) return;
    if (!arming) {
      setArming(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteExpense(expense.id);
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof ShopError ? e.message : "Couldn't remove — try again.");
      setBusy(false);
    }
  }

  return (
    <Sheet
      kicker={isNew ? "New expense" : expense!.category}
      title={isNew ? "Log money out" : expense!.name}
      onClose={onClose}
    >
      {!isNew && expense && !editing && (
        <div>
          <div className="flex items-center justify-between gap-3">
            <span
              className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black"
              style={{
                background: expense.paid === "Paid" ? "var(--ink)" : "var(--accent)",
                color: "#fff",
              }}
            >
              {expense.paid}
            </span>
            <span className="tnum font-display text-[24px]">{money(expense.amount)}</span>
          </div>

          <div className="mt-2 text-[12.5px] leading-relaxed text-muted">
            {expense.date ? formatDay(expense.date) : "Undated"} · {expense.method}
            {expense.notes ? ` · ${expense.notes}` : ""}
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <button onClick={() => setEditing(true)} className="btn btn-dark w-full">
              Edit
            </button>
            <button
              onClick={flipPaid}
              disabled={busy}
              className="btn border"
              style={{ borderColor: "var(--line)" }}
            >
              {expense.paid === "Paid" ? "Mark unpaid" : "Mark paid"}
            </button>
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
            {arming ? (busy ? "Removing…" : "Tap again to remove") : "Remove this expense"}
          </button>
        </div>
      )}

      {(isNew || editing) && (
        <div>
          <label className="kicker block">What was it for?</label>
          <input
            className="field mt-1.5"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Store rent"
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label className="kicker block">Amount (K)</label>
              <input
                className="field tnum mt-1.5"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="kicker block">Date</label>
              <input
                className="field mt-1.5"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label className="kicker block">Category</label>
              <select className="field mt-1.5" value={category} onChange={(e) => setCategory(e.target.value)}>
                {SHOP_EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="kicker block">Paid with</label>
              <select className="field mt-1.5" value={method} onChange={(e) => setMethod(e.target.value)}>
                {SHOP_PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3">
            <label className="kicker block">Payment status</label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {(["Paid", "Unpaid"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPaid(p)}
                  className="rounded-2xl py-2.5 text-[13px] font-extrabold"
                  style={{
                    background: paid === p ? "var(--ink)" : "var(--surface)",
                    color: paid === p ? "#fff" : "var(--ink)",
                    border: "1px solid var(--line)",
                  }}
                  aria-pressed={paid === p}
                >
                  {p}
                </button>
              ))}
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
          <button onClick={save} disabled={busy} className="btn btn-accent mt-4 w-full">
            {busy ? "Saving…" : isNew ? "Log the expense" : "Save changes"}
          </button>
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