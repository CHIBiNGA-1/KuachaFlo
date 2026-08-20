"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { ReceiptResult, Category } from "@/lib/types";

type Props = {
  receipts: ReceiptResult[];
  categories: Category[];
  onUpdated: (r: ReceiptResult) => void;
  onDeleted: (id: string) => void;
};

export function ReceiptList({ receipts, categories, onUpdated, onDeleted }: Props) {
  if (receipts.length === 0) {
    return (
      <div style={{ padding: "50px 20px", textAlign: "center", color: "var(--muted)", fontSize: "11px" }}>
        No receipts. Snap one to get started.
      </div>
    );
  }
  return (
    <div className="table">
      <div className="row header">
        <div>Merchant</div>
        <div>Date</div>
        <div>Category</div>
        <div>Total</div>
      </div>
      {receipts.map(r => (
        <ReceiptRow key={r.id} receipt={r} categories={categories} onUpdated={onUpdated} onDeleted={onDeleted} />
      ))}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "5px 8px", fontSize: "11px", borderRadius: "7px",
  border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", width: "100%",
};

function ReceiptRow({ receipt, categories, onUpdated, onDeleted }: {
  receipt: ReceiptResult;
  categories: Category[];
  onUpdated: (r: ReceiptResult) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [merchant, setMerchant] = useState(receipt.merchant ?? "");
  const [total, setTotal] = useState(receipt.total_amount?.toString() ?? "");
  const [date, setDate] = useState(receipt.purchase_date ?? "");
  const [categoryId, setCategoryId] = useState(receipt.category_id ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.patch<ReceiptResult>(`/api/v1/receipts/${receipt.id}`, {
        merchant: merchant || null,
        total_amount: total ? parseFloat(total) : null,
        purchase_date: date || null,
        category_id: categoryId || null,
      });
      onUpdated(updated);
      setEditing(false);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    setDeleting(true);
    try {
      await api.delete(`/api/v1/receipts/${receipt.id}`);
      onDeleted(receipt.id);
    } finally { setDeleting(false); }
  };

  const cat = categories.find(c => c.id === receipt.category_id);
  const needsReview = receipt.status === "needs_review" || receipt.confidence === "low";
  const initials = (receipt.merchant ?? "??").substring(0, 2).toUpperCase();
  const dateLabel = receipt.purchase_date
    ? new Date(receipt.purchase_date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : "—";

  if (editing) {
    return (
      <div style={{ borderTop: "1px solid #ecece7", padding: "12px 3px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "6px" }}>
          <input value={merchant} onChange={e => setMerchant(e.target.value)} placeholder="Merchant" style={inputStyle} autoFocus />
          <input value={total} onChange={e => setTotal(e.target.value)} placeholder="Total amount" inputMode="decimal" style={inputStyle} />
          <input value={date} onChange={e => setDate(e.target.value)} placeholder="YYYY-MM-DD" style={inputStyle} />
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)} style={{ ...inputStyle }}>
            <option value="">No category</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
          <button onClick={() => setEditing(false)} className="btn" style={{ padding: "5px 10px", fontSize: "10px" }}>Cancel</button>
          <button onClick={save} disabled={saving} className="btn primary" style={{ padding: "5px 10px", fontSize: "10px" }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="row" style={{ opacity: deleting ? 0.4 : 1, cursor: "default" }}>
      <div className="merchant" style={{ cursor: "pointer" }} onClick={() => setEditing(true)}>
        <div className="merchant-logo">{initials}</div>
        <div>
          <strong>{receipt.merchant ?? "Unknown"}</strong>
          <small>{dateLabel} · {receipt.status === "needs_review" ? "needs review" : "receipt"}</small>
        </div>
      </div>

      <div className="empty">{dateLabel}</div>

      <div>
        {cat ? (
          <span className="tag green" style={{ cursor: "pointer" }} onClick={() => setEditing(true)}><span className="emoji-icon">{cat.icon}</span> {cat.name}</span>
        ) : needsReview ? (
          <span className="tag orange" style={{ cursor: "pointer" }} onClick={() => setEditing(true)}>Review</span>
        ) : (
          <span className="tag" style={{ cursor: "pointer", opacity: 0.5 }} onClick={() => setEditing(true)}>Uncategorised</span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span className="amount">
          {receipt.total_amount != null
            ? `${receipt.currency === "ZMW" ? "K" : receipt.currency} ${Number(receipt.total_amount).toFixed(2)}`
            : "—"}
        </span>
        <button
          onClick={e => { e.stopPropagation(); remove(); }}
          style={{ background: "none", border: "none", color: confirmDelete ? "#c0392b" : "var(--faint)", cursor: "pointer", fontSize: "16px", padding: "0 2px", lineHeight: 1, flexShrink: 0 }}
          title={confirmDelete ? "Click again to confirm delete" : "Delete"}
        >
          {confirmDelete ? "✕" : "·"}
        </button>
      </div>
    </div>
  );
}
