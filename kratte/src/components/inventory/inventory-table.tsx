"use client";
import {
  Bookmark,
  MoreHorizontal,
  Pencil,
  Trash2,
  ShoppingBag,
  PackagePlus,
} from "lucide-react";
import { Badge } from "@/components/ui";
import { ProductPhoto } from "@/components/inventory/product-photo";
import { money, number, type Entity } from "@/lib/types";
import type { ProductActions } from "@/components/inventory/product-card";

export function InventoryTable({
  products,
  currency,
  selected,
  onSelect,
  onSelectAll,
  onPin,
  busyIds,
  ...actions
}: ProductActions & {
  products: Entity[];
  currency: string;
  selected: Set<string>;
  onSelect: (id: string) => void;
  onSelectAll: () => void;
  onPin: (product: Entity) => void;
  busyIds: Set<string>;
}) {
  return (
    <div className="inventory-table-wrap">
      <table className="inventory-table data-table">
        <thead>
          <tr>
            <th className="checkbox-cell">
              <input
                type="checkbox"
                checked={
                  products.length > 0 &&
                  products.every((p) => selected.has(p.id))
                }
                onChange={onSelectAll}
                aria-label="Select all products on this page"
              />
            </th>
            <th>Product</th>
            <th>Category</th>
            <th>On hand</th>
            <th>Selling price</th>
            <th>Status</th>
            <th className="inventory-table-actions-heading">Quick actions</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const stock = product.stock || 0;
            const low = stock <= (product.reorderAt || 0);
            return (
              <tr
                key={product.id}
                className={selected.has(product.id) ? "selected-row" : ""}
              >
                <td className="checkbox-cell">
                  <input
                    type="checkbox"
                    checked={selected.has(product.id)}
                    onChange={() => onSelect(product.id)}
                    aria-label={`Select ${product.name}`}
                  />
                </td>
                <td>
                  <button
                    className="inventory-table-product"
                    onClick={() => actions.onView(product)}
                  >
                    <span className="inventory-table-photo">
                      <ProductPhoto product={product} />
                    </span>
                    <span>
                      <strong>{product.name}</strong>
                      <small>
                        {product.sku} · {product.unit || "Per unit"}
                      </small>
                    </span>
                  </button>
                </td>
                <td>
                  <span className="category-label">{product.category}</span>
                </td>
                <td>
                  <button
                    className={`inventory-table-stock ${low ? "low" : ""}`}
                    onClick={() => actions.onQuickEdit(product)}
                    aria-label={`Update stock for ${product.name}`}
                  >
                    {number(stock)}
                    <small>units</small>
                  </button>
                </td>
                <td className="amount-cell">
                  {money(product.price || 0, currency)}
                </td>
                <td>
                  <Badge dot>
                    {stock === 0
                      ? "Out of stock"
                      : low
                        ? "Low stock"
                        : "In stock"}
                  </Badge>
                </td>
                <td>
                  <div className="inventory-row-actions">
                    <button
                      className={`icon-button ${product.pinned ? "inventory-saved-icon" : ""}`}
                      onClick={() => onPin(product)}
                      aria-label={`${product.pinned ? "Unsave" : "Save"} ${product.name}`}
                      aria-pressed={!!product.pinned}
                      disabled={busyIds.has(product.id)}
                    >
                      <Bookmark
                        size={16}
                        fill={product.pinned ? "currentColor" : "none"}
                      />
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => actions.onQuickEdit(product)}
                      aria-label={`Quick edit ${product.name}`}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-button"
                      onClick={() =>
                        low
                          ? actions.onRestock(product)
                          : actions.onSale(product)
                      }
                      aria-label={`${low ? "Restock" : "Sell"} ${product.name}`}
                    >
                      {low ? (
                        <PackagePlus size={16} />
                      ) : (
                        <ShoppingBag size={16} />
                      )}
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => actions.onDelete(product)}
                      aria-label={`Delete ${product.name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
