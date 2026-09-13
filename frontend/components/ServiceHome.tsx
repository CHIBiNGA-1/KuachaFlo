"use client";

import { useEffect, useState } from "react";
import { supabase, type ServiceChoice } from "@/lib/supabase";

const API = process.env.NEXT_PUBLIC_API_URL || "";

async function authedFetch(path: string, options: RequestInit = {}) {
  const { data } = await supabase!.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

type Receipt = {
  id: string;
  merchant: string | null;
  amount: number | null;
  currency: string;
  category: string | null;
  purchase_date: string | null;
  status: string;
};

type Product = { id: string; name: string; sku: string | null; price: number; cost: number; stock: number };
type Sale = { id: string; product_name: string; quantity: number; total: number; sold_at: string };

export function ServiceHome({
  choice,
  email,
  onSignOut,
}: {
  choice: ServiceChoice;
  email: string;
  onSignOut: () => void;
}) {
  return (
    <div className="min-h-screen px-6 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="grid h-10 w-10 place-items-center rounded-xl text-sm font-black"
              style={{ background: "var(--ink)", color: "var(--accent)" }}
            >
              KF
            </div>
            <div>
              <div className="text-sm font-black">{choice === "personal" ? "Personal" : "Shop"}</div>
              <div className="text-xs text-muted">{email}</div>
            </div>
          </div>
          <button onClick={onSignOut} className="text-xs font-bold text-muted underline">
            Sign out
          </button>
        </div>

        {choice === "personal" ? <PersonalView /> : <ShopView />}
      </div>
    </div>
  );
}

function PersonalView() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      setReceipts(await authedFetch("/api/receipts"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load receipts.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await supabase!.auth.getSession();
      const res = await fetch(`${API}/api/receipts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session?.access_token}` },
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Upload failed.");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  const total = receipts.reduce((sum, r) => sum + (r.amount || 0), 0);

  return (
    <div>
      <div className="mb-6 rounded-2xl border p-6" style={{ borderColor: "var(--line)" }}>
        <div className="mb-1 text-xs font-bold uppercase text-muted">Total tracked</div>
        <div className="text-3xl font-black">
          {receipts[0]?.currency || "ZMW"} {total.toFixed(2)}
        </div>
      </div>

      <label
        className="mb-6 block cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center text-sm font-bold"
        style={{ borderColor: "var(--line)" }}
      >
        {uploading ? "Uploading…" : "📷 Snap or choose a receipt"}
        <input type="file" accept="image/*" hidden disabled={uploading} onChange={(e) => handleFile(e.target.files)} />
      </label>

      {error && <p className="mb-4 text-xs font-bold text-red-600">{error}</p>}

      <div className="flex flex-col gap-2">
        {receipts.length === 0 && <p className="text-center text-sm text-muted">No receipts yet.</p>}
        {receipts.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between rounded-xl border p-4"
            style={{ borderColor: "var(--line)" }}
          >
            <div>
              <div className="text-sm font-bold">{r.merchant || "Unknown merchant"}</div>
              <div className="text-xs text-muted">
                {r.category || "Uncategorised"} · {r.purchase_date}
              </div>
            </div>
            <div className="text-sm font-black">
              {r.amount != null ? `${r.currency} ${r.amount.toFixed(2)}` : "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ShopView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const [p, s] = await Promise.all([authedFetch("/api/shop/products"), authedFetch("/api/shop/sales")]);
      setProducts(p);
      setSales(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load shop data.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function addProduct(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await authedFetch("/api/shop/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, price: Number(price) || 0, stock: Number(stock) || 0 }),
      });
      setName("");
      setPrice("");
      setStock("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add product.");
    } finally {
      setBusy(false);
    }
  }

  async function sell(productId: string) {
    setError("");
    try {
      await authedFetch("/api/shop/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId, quantity: 1 }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't record sale.");
    }
  }

  return (
    <div>
      <form
        onSubmit={addProduct}
        className="mb-6 flex flex-col gap-2 rounded-2xl border p-4 sm:flex-row"
        style={{ borderColor: "var(--line)" }}
      >
        <input
          placeholder="Product name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="flex-1 rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--line)" }}
        />
        <input
          placeholder="Price"
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-24 rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--line)" }}
        />
        <input
          placeholder="Stock"
          type="number"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          className="w-24 rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--line)" }}
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg px-4 py-2 text-sm font-bold text-white"
          style={{ background: "var(--ink)" }}
        >
          Add
        </button>
      </form>

      {error && <p className="mb-4 text-xs font-bold text-red-600">{error}</p>}

      <div className="mb-8">
        <h2 className="mb-2 text-xs font-bold uppercase text-muted">Inventory</h2>
        <div className="flex flex-col gap-2">
          {products.length === 0 && <p className="text-sm text-muted">No products yet.</p>}
          {products.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-xl border p-4"
              style={{ borderColor: "var(--line)" }}
            >
              <div>
                <div className="text-sm font-bold">{p.name}</div>
                <div className="text-xs text-muted">
                  {p.stock} in stock · K{p.price}
                </div>
              </div>
              <button
                onClick={() => sell(p.id)}
                disabled={p.stock < 1}
                className="rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-40"
                style={{ borderColor: "var(--line)" }}
              >
                Sell 1
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-xs font-bold uppercase text-muted">Recent sales</h2>
        <div className="flex flex-col gap-2">
          {sales.length === 0 && <p className="text-sm text-muted">No sales yet.</p>}
          {sales.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-xl border p-4"
              style={{ borderColor: "var(--line)" }}
            >
              <div className="text-sm font-bold">
                {s.quantity}× {s.product_name}
              </div>
              <div className="text-sm font-black">K{s.total.toFixed(2)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
