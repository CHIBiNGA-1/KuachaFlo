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
import { ProductPhoto } from "@/components/inventory/product-photo";
import { Spinner } from "@/components/ui";
import { productArt } from "@/lib/product-art";
import { money, number, type Entity } from "@/lib/types";

export type ProductActions = {
  onView: (product: Entity) => void;
  onEdit: (product: Entity) => void;
  onDelete: (product: Entity) => void;
  onQuickEdit: (product: Entity) => void;
  onSale: (product: Entity) => void;
  onRestock: (product: Entity) => void;
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
  showFollowup = false,
  ...actions
}: ProductActions & {
  product: Entity;
  currency: string;
  selecting: boolean;
  selected: boolean;
  pinBusy: boolean;
  onSelect: () => void;
  onPin: () => void;
  incoming?: { order: Entity; quantity: number };
  eager?: boolean;
  showFollowup?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const stock = product.stock || 0;
  const low = stock <= (product.reorderAt || 0);
  const art = productArt(product);
  useEffect(() => {
    if (!menuOpen) return;
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);
  const action = (callback: (entity: Entity) => void) => {
    setMenuOpen(false);
    callback(product);
  };
  return (
    <article
      className={`inventory-pin ${selected ? "pin-selected" : ""} ${menuOpen ? "pin-menu-open" : ""}`}
      aria-label={product.name}
      data-product-id={product.id}
    >
      <div className="pin-media" style={{ aspectRatio: art.ratio }}>
        <button
          className="pin-image-button"
          onClick={() => (selecting ? onSelect() : actions.onView(product))}
          aria-label={
            selecting ? `Select ${product.name}` : `View ${product.name}`
          }
        >
          <ProductPhoto product={product} eager={eager} />
        </button>
        {selecting ? (
          <button
            className={`pin-select ${selected ? "is-selected" : ""}`}
            role="checkbox"
            aria-checked={selected}
            aria-label={`Select ${product.name}`}
            onClick={onSelect}
          >
            {selected && <Check size={16} />}
          </button>
        ) : null}
        <button
          className={`pin-bookmark ${product.pinned ? "is-saved" : ""}`}
          onClick={onPin}
          disabled={pinBusy}
          aria-label={`${product.pinned ? "Unsave" : "Save"} ${product.name}`}
          aria-pressed={!!product.pinned}
          title={
            product.pinned
              ? "Remove from saved products"
              : "Save to your favorites"
          }
        >
          {pinBusy ? (
            <Spinner size={16} />
          ) : (
            <Bookmark
              size={17}
              strokeWidth={1.7}
              fill={product.pinned ? "currentColor" : "none"}
            />
          )}
        </button>
        {!selecting && (
          <div className="pin-quick-actions">
            <button
              onClick={() => actions.onQuickEdit(product)}
              aria-label={`Quick edit ${product.name}`}
            >
              <Pencil size={13} />
              <span>Quick edit</span>
            </button>
            <button
              onClick={() => actions.onSale(product)}
              disabled={stock === 0}
              aria-label={`Sell ${product.name}`}
              title={
                stock
                  ? "Start a sale with this product"
                  : "Restock before selling"
              }
            >
              <Plus size={15} />
              <span>Sell</span>
            </button>
          </div>
        )}
      </div>
      <div className="pin-content">
        <div className="pin-title-line">
          <button className="pin-title" onClick={() => actions.onView(product)}>
            {product.name}
          </button>
          <strong className="pin-price">
            {money(product.price || 0, currency)}
          </strong>
        </div>
        <div className="pin-stock-line">
          <button
            className={`pin-stock ${stock === 0 ? "empty" : low ? "low" : "healthy"}`}
            onClick={() => actions.onQuickEdit(product)}
            aria-label={`Update stock for ${product.name}`}
          >
            <i />
            <span>
              {stock === 0
                ? "Out of stock"
                : low
                  ? `Only ${number(stock)} left`
                  : `${number(stock)} in stock`}
            </span>
          </button>
          <div className="pin-menu-wrap" ref={menuRef}>
            <button
              className="pin-more"
              aria-label={`Actions for ${product.name}`}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MoreHorizontal size={19} />
            </button>
            {menuOpen && (
              <div className="pin-action-menu">
                <button onClick={() => action(actions.onView)}>
                  <Eye size={14} />
                  View details
                </button>
                <button onClick={() => action(actions.onQuickEdit)}>
                  <Pencil size={14} />
                  Quick edit
                </button>
                <button onClick={() => action(actions.onEdit)}>
                  <Pencil size={14} />
                  Edit all details
                </button>
                <button
                  disabled={stock === 0}
                  onClick={() => action(actions.onSale)}
                >
                  <ShoppingBag size={14} />
                  Start a sale
                </button>
                <button onClick={() => action(actions.onRestock)}>
                  <PackagePlus size={14} />
                  Create restock order
                </button>
                <button
                  className="pin-delete-action"
                  onClick={() => action(actions.onDelete)}
                >
                  <Trash2 size={14} />
                  Delete product
                </button>
              </div>
            )}
          </div>
        </div>
        {low && showFollowup ? (
          incoming ? (
            <button
              className="pin-followup incoming"
              onClick={() => actions.onView(incoming.order)}
              aria-label={`View incoming order for ${product.name}`}
            >
              <Truck size={14} />
              <span>{number(incoming.quantity)} units on the way</span>
              <ArrowUpRight size={14} />
            </button>
          ) : (
            <button
              className="pin-followup needs-restock"
              onClick={() => actions.onRestock(product)}
              aria-label={`Restock ${product.name}`}
            >
              <PackagePlus size={14} />
              <span>Create restock order</span>
              <ArrowUpRight size={14} />
            </button>
          )
        ) : null}
      </div>
    </article>
  );
}
