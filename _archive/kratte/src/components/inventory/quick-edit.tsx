"use client";
import { useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Check, PackageCheck, ShieldCheck } from "lucide-react";
import { useShop } from "@/components/shop-provider";
import { Modal, Spinner } from "@/components/ui";
import { ProductPhoto } from "@/components/inventory/product-photo";
import { ApiError } from "@/lib/client-api";
import { money, type Entity, type RecordData } from "@/lib/types";

export function QuickEdit({
  product,
  onClose,
  onFullEdit,
}: {
  product: Entity;
  onClose: () => void;
  onFullEdit: () => void;
}) {
  const { data, saveRecord, refresh } = useShop();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const [price, setPrice] = useState(String(product.price || 0));
  const [stock, setStock] = useState(String(product.stock || 0));
  const [threshold, setThreshold] = useState(String(product.reorderAt || 0));
  const currency = data?.user.settings.currency || "USD";
  const margin =
    Number(price) > 0
      ? ((Number(price) - (product.cost || 0)) / Number(price)) * 100
      : 0;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving.current) return;
    setError("");
    saving.current = true;
    setBusy(true);
    const changes: RecordData = { name: product.name };
    if (Number(price) !== (product.price || 0)) changes.price = Number(price);
    if (Number(threshold) !== (product.reorderAt || 0))
      changes.reorderAt = Number(threshold);
    if (Number(stock) !== (product.stock || 0)) {
      changes.stock = Number(stock);
      changes.expectedStock = product.stock || 0;
    }
    try {
      await saveRecord("inventory", changes, product.id, {
        successMessage: `${product.name} is up to date. Nicely done.`,
      });
      onClose();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Couldn’t save these changes. Please try again.",
      );
      if (failure instanceof ApiError && failure.code === "STOCK_CHANGED")
        await refresh().catch(() => {});
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      title="A quick little update"
      description="The essentials, without leaving your board."
      onClose={() => {
        if (!busy) onClose();
      }}
      className="inventory-quick-modal"
    >
      <form onSubmit={submit}>
        <div className="modal-body">
          <div className="quick-product-preview">
            <div>
              <ProductPhoto product={product} eager />
            </div>
            <span>
              <small>
                {product.category || "Your collection"} ·{" "}
                {product.unit || "Per unit"}
              </small>
              <h3>{product.name}</h3>
              <p>{product.sku}</p>
            </span>
          </div>
          <div className="form-grid">
            <label className="form-field full-width">
              <span>
                Selling price <small>({currency})</small>
              </span>
              <input
                name="price"
                type="number"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                required
                min="0"
                max="1000000000"
                step="0.01"
              />
              <small className={`quick-margin ${margin < 0 ? "negative" : ""}`}>
                Cost {money(product.cost || 0, currency)} <span>·</span>{" "}
                {Number.isFinite(margin) ? margin.toFixed(1) : "0.0"}% gross
                margin
              </small>
            </label>
            <label className="form-field">
              <span>Stock on hand</span>
              <input
                name="stock"
                type="number"
                value={stock}
                onChange={(event) => setStock(event.target.value)}
                required
                min="0"
                max="1000000000"
                step="1"
              />
            </label>
            <label className="form-field">
              <span>Low-stock threshold</span>
              <input
                name="reorderAt"
                type="number"
                value={threshold}
                onChange={(event) => setThreshold(event.target.value)}
                required
                min="0"
                max="1000000000"
                step="1"
              />
            </label>
          </div>
          <div className="quick-stock-tip">
            <PackageCheck size={19} />
            <p>
              {Number(stock) === 0
                ? "Out of stock. Create a purchase order to bring this product back."
                : Number(stock) <= Number(threshold)
                  ? "This product will appear in Needs attention until stock is above its threshold."
                  : "Looking good. This product is above its low-stock threshold."}
            </p>
          </div>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <button
            type="button"
            className="text-link quick-full-edit"
            disabled={busy}
            onClick={onFullEdit}
          >
            Edit all product details
            <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button button-primary" disabled={busy}>
            {busy ? <Spinner /> : <Check size={16} />}{" "}
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
