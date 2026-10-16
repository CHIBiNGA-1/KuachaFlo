"use client";

import { useResync } from "@/lib/offline/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  Boxes,
  LayoutGrid,
  Pencil,
  PackagePlus,
  Plus,
  Rows3,
  Search,
  Shapes,
  SlidersHorizontal,
  TriangleAlert,
  X,
} from "lucide-react";
import { money } from "@/lib/format";
import {
  ShopError,
  SHOP_CATEGORIES,
  listProducts,
  stockState,
  tintFor,
  updateProduct,
  type Product,
} from "@/lib/shop";
import { MasonryCell } from "../inventory/MasonryCell";
import { ProductCard } from "../inventory/ProductCard";
import { ProductPhoto } from "../inventory/ProductPhoto";
import { ProductSheet } from "./ProductSheet";
import { QuickEditSheet } from "./QuickEditSheet";

type Tab = "all" | "in" | "low" | "out" | "saved";
type View = "board" | "table";
type Density = "comfortable" | "compact";
type Sort = "recent" | "name" | "stock-low" | "price-high";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "in", label: "In stock" },
  { id: "low", label: "Running low" },
  { id: "out", label: "Out of stock" },
  { id: "saved", label: "Saved" },
];

const SORTS: { id: Sort; label: string }[] = [
  { id: "recent", label: "Recently added" },
  { id: "name", label: "Name A–Z" },
  { id: "stock-low", label: "Least stock first" },
  { id: "price-high", label: "Highest price" },
];

export function InventoryTab({
  initialFilter = "all",
  currency = "ZMW",
  onSell,
  onRestock,
}: {
  initialFilter?: "all" | "attention" | "saved";
  currency?: string;
  onSell?: (p: Product) => void;
  onRestock?: (p: Product) => void;
}) {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>(
    initialFilter === "attention" ? "low" : initialFilter === "saved" ? "saved" : "all"
  );
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("recent");
  const [view, setView] = useState<View>("board");
  const [density, setDensity] = useState<Density>("comfortable");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pinBusy, setPinBusy] = useState<string | null>(null);

  const [sheet, setSheet] = useState<
    | { mode: "closed" }
    | { mode: "new" }
    | { mode: "view"; product: Product }
    | { mode: "quick"; product: Product }
  >({ mode: "closed" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listProducts());
    } catch (e) {
      setError(e instanceof ShopError ? e.message : "Couldn't load your shelf — try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useResync(load);

  useEffect(() => {
    setTab(initialFilter === "attention" ? "low" : initialFilter === "saved" ? "saved" : "all");
  }, [initialFilter]);

  // Counts come from the unfiltered set so the tabs stay a stable map of
  // the shop rather than a reflection of whatever filter is on.
  const counts = useMemo(() => {
    const c = { all: items.length, in: 0, low: 0, out: 0, saved: 0 };
    for (const p of items) {
      c[stockState(p)] += 1;
      if (p.pinned) c.saved += 1;
    }
    return c;
  }, [items]);

  const categories = useMemo(() => {
    const seen = new Map<string, number>();
    for (const p of items) seen.set(p.category, (seen.get(p.category) || 0) + 1);
    return SHOP_CATEGORIES.filter((c) => seen.has(c)).map((c) => ({
      name: c,
      count: seen.get(c)!,
    }));
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items.filter((p) => {
      if (tab === "saved" ? !p.pinned : tab !== "all" && stockState(p) !== tab) return false;
      if (category && p.category !== category) return false;
      if (q && !`${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(q)) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "stock-low") return (a.stock || 0) - (b.stock || 0);
      if (sort === "price-high") return (b.price || 0) - (a.price || 0);
      return (b.created_at || "").localeCompare(a.created_at || "");
    });
    // Saved products lead the board everywhere except the saved tab itself,
    // where that ordering would be meaningless.
    if (tab !== "saved") list = [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned));
    return list;
  }, [items, tab, category, query, sort]);

  const filtersOn = Boolean(query.trim()) || category !== null || tab !== "all";

  async function togglePin(p: Product) {
    setPinBusy(p.id);
    // Optimistic: saving a product is a glance-level action, and waiting
    // on a round-trip to see the bookmark fill makes the board feel dead.
    setItems((list) => list.map((x) => (x.id === p.id ? { ...x, pinned: !x.pinned } : x)));
    try {
      const updated = await updateProduct(p.id, { pinned: !p.pinned });
      setItems((list) => list.map((x) => (x.id === p.id ? updated : x)));
    } catch {
      setItems((list) => list.map((x) => (x.id === p.id ? { ...x, pinned: p.pinned } : x)));
    } finally {
      setPinBusy(null);
    }
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearFilters() {
    setQuery("");
    setCategory(null);
    setTab("all");
  }

  const actions = {
    onView: (p: Product) => setSheet({ mode: "view", product: p }),
    onEdit: (p: Product) => setSheet({ mode: "view", product: p }),
    onQuickEdit: (p: Product) => setSheet({ mode: "quick", product: p }),
    onDelete: (p: Product) => setSheet({ mode: "view", product: p }),
    onSell: (p: Product) => onSell?.(p),
    onRestock: (p: Product) => onRestock?.(p),
  };

  return (
    <div className="shelf">
      {/* ── Heading ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="kicker">Your shelf</div>
          <h1 className="font-display text-[28px] leading-tight tracking-tight">Inventory</h1>
          <p className="mt-1 text-[13px] text-muted">
            {loading
              ? "Counting what's on the shelf…"
              : counts.all === 0
                ? "Nothing on the shelf yet."
                : `${counts.all} ${counts.all === 1 ? "product" : "products"}, ${counts.low + counts.out} needing a look.`}
          </p>
        </div>
        <button className="btn btn-accent" onClick={() => setSheet({ mode: "new" })}>
          <Plus size={15} />
          Add product
        </button>
      </div>

      {/* ── Snapshot: stock health, not money ───────────────────────── */}
      {!loading && counts.all > 0 && (
        <div className="shelf-snapshot mt-5">
          <div>
            <span className="snap-icon">
              <Boxes size={17} />
            </span>
            <span className="snap-text">
              <strong>{counts.all}</strong>
              <small>On the shelf</small>
            </span>
          </div>
          <button onClick={() => setTab("in")}>
            <span className="snap-icon">
              <Shapes size={17} />
            </span>
            <span className="snap-text">
              <strong>{counts.in}</strong>
              <small>Well stocked</small>
            </span>
          </button>
          <button onClick={() => setTab("low")}>
            <span className="snap-icon" style={{ color: counts.low ? "var(--amber)" : undefined }}>
              <TriangleAlert size={17} />
            </span>
            <span className="snap-text">
              <strong style={{ color: counts.low ? "var(--amber)" : undefined }}>{counts.low}</strong>
              <small>Running low</small>
            </span>
          </button>
          <button onClick={() => setTab("out")}>
            <span className="snap-icon" style={{ color: counts.out ? "var(--red)" : undefined }}>
              <PackagePlus size={17} />
            </span>
            <span className="snap-text">
              <strong style={{ color: counts.out ? "var(--red)" : undefined }}>{counts.out}</strong>
              <small>Needs reordering</small>
            </span>
          </button>
        </div>
      )}

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <div className="mt-6 flex items-end justify-between gap-4">
        <div className="shelf-tabs min-w-0 flex-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "active" : ""}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
            >
              {t.id === "saved" && <Bookmark size={14} />}
              {t.label}
              <span className={t.id === "low" || t.id === "out" ? "warn" : ""}>{counts[t.id]}</span>
            </button>
          ))}
        </div>
        <div className="shelf-switch mb-2 hidden sm:inline-flex">
          <button
            className={view === "board" ? "active" : ""}
            onClick={() => setView("board")}
            aria-label="Board view"
            title="Board view"
          >
            <LayoutGrid size={15} />
          </button>
          <button
            className={view === "table" ? "active" : ""}
            onClick={() => setView("table")}
            aria-label="Table view"
            title="Table view"
          >
            <Rows3 size={15} />
          </button>
        </div>
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <label className="shelf-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, SKU or category"
            aria-label="Search inventory"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </label>

        <div className="ml-auto flex flex-wrap items-center gap-2.5">
          <label className="shelf-tool">
            <SlidersHorizontal size={13} />
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort products">
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          {view === "board" && (
            <button
              className={`shelf-tool ${density === "compact" ? "active" : ""}`}
              onClick={() => setDensity((d) => (d === "compact" ? "comfortable" : "compact"))}
              title="Fit more on screen"
            >
              <Rows3 size={13} />
              {density === "compact" ? "Compact" : "Roomy"}
            </button>
          )}

          <button
            className={`shelf-tool ${selecting ? "active" : ""}`}
            onClick={() => {
              setSelecting((s) => !s);
              setSelected(new Set());
            }}
          >
            <Pencil size={13} />
            {selecting ? "Done" : "Select"}
          </button>
        </div>
      </div>

      {/* ── Category chips ──────────────────────────────────────────── */}
      {categories.length > 1 && (
        <div className="mt-4 flex items-center gap-3">
          <div className="shelf-chips min-w-0 flex-1">
            <button className={category === null ? "active" : ""} onClick={() => setCategory(null)}>
              All categories
            </button>
            {categories.map((c) => (
              <button
                key={c.name}
                className={category === c.name ? "active" : ""}
                onClick={() => setCategory(category === c.name ? null : c.name)}
              >
                <i style={{ background: tintFor(c.name) }} />
                {c.name}
              </button>
            ))}
          </div>
          <span className="hidden shrink-0 text-[11px] text-muted md:block">
            {visible.length} shown
          </span>
        </div>
      )}

      {/* ── Selection bar ───────────────────────────────────────────── */}
      {selecting && selected.size > 0 && (
        <div className="shelf-selection mt-4">
          <span>
            {selected.size} selected
          </span>
          <div className="flex items-center gap-4">
            <button onClick={() => setSelected(new Set(visible.map((p) => p.id)))}>
              Select all shown
            </button>
            <button onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        </div>
      )}

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div className="mt-5">
        {loading ? (
          <div className="masonry">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="masonry-cell" style={{ gridRowEnd: "span 320" }}>
                <div
                  className="animate-pulse rounded-2xl"
                  style={{ height: 290, background: "var(--surface-2)" }}
                />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="card p-8 text-center">
            <p className="text-[13px] text-muted">{error}</p>
            <button className="btn mt-4" onClick={load}>
              Try again
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="card p-12 text-center">
            <div
              className="mx-auto grid h-14 w-14 place-items-center rounded-2xl"
              style={{ background: "var(--accent-wash)", color: "var(--accent)" }}
            >
              <Boxes size={24} />
            </div>
            <h3 className="mt-4 font-display text-xl">
              {counts.all === 0 ? "Your shelf is empty" : "Nothing matches that"}
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-muted">
              {counts.all === 0
                ? "Add your first product and it'll show up here — photo, price, and what's left on the shelf."
                : "Try a different category, or clear what you've narrowed down."}
            </p>
            <button
              className="btn btn-accent mt-5"
              onClick={() => (counts.all === 0 ? setSheet({ mode: "new" }) : clearFilters())}
            >
              {counts.all === 0 ? "Add your first product" : "Clear filters"}
            </button>
          </div>
        ) : view === "table" ? (
          <div className="shelf-table-wrap">
            <table className="shelf-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Stock</th>
                  <th>Price</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const state = stockState(p);
                  return (
                    <tr key={p.id} className={selected.has(p.id) ? "is-selected" : ""}>
                      <td>
                        <button className="row-product" onClick={() => actions.onView(p)}>
                          <span className="row-photo">
                            <ProductPhoto product={p} />
                          </span>
                          <span>
                            <strong>{p.name}</strong>
                            <small>{p.sku}</small>
                          </span>
                        </button>
                      </td>
                      <td className="text-muted">{p.category}</td>
                      <td>
                        <span
                          className="tnum font-semibold"
                          style={{
                            color:
                              state === "out"
                                ? "var(--red)"
                                : state === "low"
                                  ? "var(--amber)"
                                  : undefined,
                          }}
                        >
                          {p.stock}
                          {p.unit ? ` ${p.unit}` : ""}
                        </span>
                      </td>
                      <td className="tnum font-semibold">{money(p.price || 0, currency)}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            className={p.pinned ? "is-saved" : ""}
                            onClick={() => togglePin(p)}
                            disabled={pinBusy === p.id}
                            aria-label={`${p.pinned ? "Unsave" : "Save"} ${p.name}`}
                          >
                            <Bookmark size={15} fill={p.pinned ? "currentColor" : "none"} />
                          </button>
                          <button onClick={() => actions.onQuickEdit(p)} aria-label={`Quick edit ${p.name}`}>
                            <Pencil size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={`masonry ${density === "compact" ? "compact" : ""}`}>
            {visible.map((p, i) => (
              <MasonryCell key={p.id}>
                <ProductCard
                  product={p}
                  currency={currency}
                  selecting={selecting}
                  selected={selected.has(p.id)}
                  pinBusy={pinBusy === p.id}
                  onSelect={() => toggleSelect(p.id)}
                  onPin={() => togglePin(p)}
                  eager={i < 6}
                  {...actions}
                />
              </MasonryCell>
            ))}
            {!filtersOn && (
              <MasonryCell>
                <button className="shelf-add" onClick={() => setSheet({ mode: "new" })}>
                  <span>
                    <Plus size={20} />
                  </span>
                  <strong>Add another product</strong>
                  <small>Name, price, and what&apos;s on the shelf. Photo optional.</small>
                </button>
              </MasonryCell>
            )}
          </div>
        )}
      </div>

      {/* ── Sheets ──────────────────────────────────────────────────── */}
      {(sheet.mode === "new" || sheet.mode === "view") && (
        <ProductSheet
          product={sheet.mode === "view" ? sheet.product : null}
          onClose={() => setSheet({ mode: "closed" })}
          onChanged={load}
          onQuick={(p) => setSheet({ mode: "quick", product: p })}
          onTogglePin={togglePin}
        />
      )}
      {sheet.mode === "quick" && (
        <QuickEditSheet
          product={sheet.product}
          onClose={() => setSheet({ mode: "closed" })}
          onChanged={load}
          onFullEdit={(p) => setSheet({ mode: "view", product: p })}
        />
      )}
    </div>
  );
}
