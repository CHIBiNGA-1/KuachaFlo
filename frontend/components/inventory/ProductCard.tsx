"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  Eye,
  MoreHorizontal,
  PackagePlus,
  Pencil,
  Plus,
  ShoppingBag,
  Trash2,
  Truck,
} from "lucide-react";
import { ProductPhoto } from "./ProductPhoto";
import { productArt } from "@/lib/product-art";
import { money } from "@/lib/format";
import { stockState, type Product } from "@/lib/shop";

export type ProductActions = {
  onView: (p: Product) => void;
  onEdit: (p: Product) => void;
  onDelete: (p: Product) => void;
  onQuickEdit: (p: Product) => void;
  onSell: (p: Product) => void;
  onRestock: (p: Product) => void;
};

export function ProductCard({
  product,
  currency,
  selecting,
  selected,
  pinBusy,
  onSelect,
  onPin,
  incoming,
  eager,
  ...actions
}: ProductActions & {
  product: Product;
  currency: string;
  selecting: boolean;
  selected: boolean;
  pinBusy: boolean;
  onSelect: () => void;
  onPin: () => void;
  incoming?: { reference: string; quantity: number };
  eager?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const art = productArt(product);
  const stock = product.stock || 0;
  const state = stockState(product);

  useEffect(() => {
    if (!menuOpen) return;
    const outside = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", esc);
    };
  }, [menuOpen]);

  const run = (fn: (p: Product) => void) => {
    setMenuOpen(false);
    fn(product);
  };

  return (
    <article
      className={`pin ${selected ? "is-selected" : ""} ${menuOpen ? "menu-open" : ""}`}
      aria-label={product.name}
    >
      <div className="pin-media" style={{ aspectRatio: art.ratio }}>
        <button
          className="pin-image-button"
          onClick={() => (selecting ? onSelect() : actions.onView(product))}
          aria-label={selecting ? `Select ${product.name}` : `View ${product.name}`}
        >
          <ProductPhoto product={product} eager={eager} />
        </button>

        {state === "out" && <span className="pin-flag out">Out of stock</span>}
        {state === "low" && <span className="pin-flag low">Running low</span>}

        {selecting ? (
          <button
            className={`pin-select ${selected ? "is-selected" : ""}`}
            role="checkbox"
            aria-checked={selected}
            aria-label={`Select ${product.name}`}
            onClick={onSelect}
          >
            {selected && <Check size={15} strokeWidth={3} />}
          </button>
        ) : (
          <button
            className={`pin-save ${product.pinned ? "is-saved" : ""}`}
            onClick={onPin}
            disabled={pinBusy}
            aria-pressed={product.pinned}
            aria-label={`${product.pinned ? "Unsave" : "Save"} ${product.name}`}
            title={product.pinned ? "Remove from saved" : "Save to your shortlist"}
          >
            <Bookmark size={16} strokeWidth={1.8} fill={product.pinned ? "currentColor" : "none"} />
          </button>
        )}

        {!selecting && (
          <div className="pin-quick">
            <button onClick={() => actions.onQuickEdit(product)} aria-label={`Quick edit ${product.name}`}>
              <Pencil size={12} />
              <span>Quick edit</span>
            </button>
            <button
              className="primary"
              onClick={() => actions.onSell(product)}
              disabled={stock === 0}
              title={stock ? "Start a sale with this product" : "Restock before selling"}
              aria-label={`Sell ${product.name}`}
            >
              <Plus size={14} />
              <span>Sell</span>
            </button>
          </div>
        )}
      </div>

      <div className="pin-body">
        <div className="pin-meta">
          <span>{product.category || "Uncategorised"}</span>
          <span>{product.sku}</span>
        </div>

        <div className="pin-headline">
          <button className="pin-name" onClick={() => actions.onView(product)}>
            {product.name}
          </button>
          <strong className="pin-price tnum">{money(product.price || 0, currency)}</strong>
        </div>

        <div className="pin-footline">
          <button
            className={`pin-stock ${state}`}
            onClick={() => actions.onQuickEdit(product)}
            aria-label={`Update stock for ${product.name}`}
          >
            <i />
            <span className="tnum">
              {state === "out"
                ? "None left"
                : state === "low"
                  ? `Only ${stock} left`
                  : `${stock} in stock`}
              {product.unit ? ` ${product.unit}` : ""}
            </span>
          </button>

          <div className="pin-menu-wrap" ref={menuRef}>
            <button
              className="pin-more"
              aria-label={`Actions for ${product.name}`}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <MoreHorizontal size={18} />
            </button>
            {menuOpen && (
              <div className="pin-menu" role="menu">
                <button onClick={() => run(actions.onView)}>
                  <Eye size={14} /> View details
                </button>
                <button onClick={() => run(actions.onQuickEdit)}>
                  <Pencil size={14} /> Quick edit
                </button>
                <button onClick={() => run(actions.onEdit)}>
                  <Pencil size={14} /> Edit all details
                </button>
                <button disabled={stock === 0} onClick={() => run(actions.onSell)}>
                  <ShoppingBag size={14} /> Start a sale
                </button>
                <button onClick={() => run(actions.onRestock)}>
                  <PackagePlus size={14} /> Restock from supplier
                </button>
                <button className="danger" onClick={() => run(actions.onDelete)}>
                  <Trash2 size={14} /> Delete product
                </button>
              </div>
            )}
          </div>
        </div>

        {state !== "in" &&
          (incoming ? (
            <div className="pin-followup incoming">
              <Truck size={13} />
              <span className="tnum">
                {incoming.quantity} on the way · {incoming.reference}
              </span>
            </div>
          ) : (
            <button className="pin-followup restock" onClick={() => actions.onRestock(product)}>
              <PackagePlus size={13} />
              <span>Order more from a supplier</span>
              <ArrowUpRight size={13} />
            </button>
          ))}
      </div>
    </article>
  );
}
