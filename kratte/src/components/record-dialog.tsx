"use client";
import { useState, type FormEvent } from "react";
import {
  Plus,
  Trash2,
  ShoppingBag,
  Package,
  CheckCircle2,
  AlertTriangle,
  Pencil,
  Printer,
  ArrowRight,
  Minus,
} from "lucide-react";
import { useShop } from "@/components/shop-provider";
import { Avatar, Badge, Modal, ProductThumb, Spinner } from "@/components/ui";
import {
  configs,
  dateLabel,
  money,
  type Entity,
  type LineItem,
  type RecordData,
  type Resource,
} from "@/lib/types";
import { productArt } from "@/lib/product-art";

export function RecordEditor({
  resource,
  entity,
  onClose,
  initialProduct,
}: {
  resource: Resource;
  entity?: Entity;
  onClose: () => void;
  initialProduct?: Entity;
}) {
  const { data, saveRecord } = useShop();
  const config = configs[resource];
  const order = resource === "sales" || resource === "purchases";
  const purchase = resource === "purchases";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<LineItem[]>(
    entity?.items ||
      (initialProduct
        ? [
            {
              productId: initialProduct.id,
              name: initialProduct.name,
              quantity: purchase
                ? Math.max(
                    1,
                    (initialProduct.reorderAt || 20) * 2 -
                      (initialProduct.stock || 0),
                  )
                : 1,
              price:
                (purchase ? initialProduct.cost : initialProduct.price) || 0,
              cost: initialProduct.cost || 0,
            },
          ]
        : []),
  );
  const [productId, setProductId] = useState("");
  if (!data) return null;
  const currency = data.user.settings.currency;
  const total = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const addProduct = () => {
    const product = data.records.inventory.find((p) => p.id === productId);
    if (!product) return;
    setItems((current) => {
      const existing = current.find((i) => i.productId === productId);
      return existing
        ? current.map((i) =>
            i.productId === productId ? { ...i, quantity: i.quantity + 1 } : i,
          )
        : [
            ...current,
            {
              productId,
              name: product.name,
              quantity: 1,
              price: (purchase ? product.cost : product.price) || 0,
              cost: product.cost || 0,
            },
          ];
    });
    setProductId("");
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (order && !items.length) {
      setError("Add at least one product to continue.");
      return;
    }
    setBusy(true);
    const values = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    ) as Record<string, unknown>;
    if (entity?.version) values.expectedVersion = entity.version;
    if (order) {
      values.items = items;
      values.amount = total;
      values.name = entity?.name || "";
    } else
      for (const field of config.fields)
        if (field.type === "number")
          values[field.key] = Number(values[field.key] || 0);
    try {
      await saveRecord(resource, values as RecordData, entity?.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save this record.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={`${entity ? "Edit" : "New"} ${config.singular}`}
      description={
        order
          ? purchase
            ? "Keep your shelves ready for what’s next."
            : "A good sale starts with a few simple details."
          : `All the details your ${config.singular} needs, in one place.`
      }
      onClose={() => {
        if (!busy) onClose();
      }}
      wide={order}
    >
      <form onSubmit={submit}>
        <div className="modal-body">
          <div className="form-grid">
            {order ? (
              <>
                <label className="form-field">
                  <span>
                    {purchase ? "Supplier" : "Customer"}
                    {purchase && <em>*</em>}
                  </span>
                  <select
                    name={purchase ? "supplier" : "customer"}
                    defaultValue={
                      entity?.supplier ||
                      entity?.customer ||
                      (purchase ? initialProduct?.supplier : "") ||
                      ""
                    }
                    required={purchase}
                  >
                    <option value="">
                      {purchase ? "Select a supplier" : "Walk-in customer"}
                    </option>
                    {data.records[purchase ? "suppliers" : "customers"].map(
                      (p) => (
                        <option
                          key={p.id}
                          value={purchase ? p.name : p.company || p.name}
                        >
                          {purchase ? p.name : p.company || p.name}
                        </option>
                      ),
                    )}
                    {(purchase ? entity?.supplier : entity?.customer) &&
                      !data.records[purchase ? "suppliers" : "customers"].some(
                        (p) =>
                          (purchase ? p.name : p.company || p.name) ===
                          (purchase ? entity?.supplier : entity?.customer),
                      ) && (
                        <option
                          value={purchase ? entity?.supplier : entity?.customer}
                        >
                          {purchase ? entity?.supplier : entity?.customer}
                        </option>
                      )}
                  </select>
                </label>
                <label className="form-field">
                  <span>
                    {purchase ? "Expected delivery" : "Sales channel"}
                  </span>
                  {purchase ? (
                    <input
                      type="date"
                      name="dueDate"
                      defaultValue={
                        entity?.dueDate ||
                        new Date(Date.now() + 3 * 86400000)
                          .toISOString()
                          .slice(0, 10)
                      }
                    />
                  ) : (
                    <select
                      name="channel"
                      defaultValue={entity?.channel || "Retail"}
                    >
                      <option>Retail</option>
                      <option>Wholesale</option>
                    </select>
                  )}
                </label>
                <div className="order-product-section full-width">
                  <div className="form-section-heading">
                    <h3>Order items</h3>
                    <span>
                      {items.length}{" "}
                      {items.length === 1 ? "product" : "products"}
                    </span>
                  </div>
                  <div className="product-picker">
                    <select
                      aria-label="Choose a product"
                      value={productId}
                      onChange={(e) => setProductId(e.target.value)}
                    >
                      <option value="">Search your catalog…</option>
                      {data.records.inventory.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ·{" "}
                          {money((purchase ? p.cost : p.price) || 0, currency)}{" "}
                          · {p.stock} in stock
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="button"
                      onClick={addProduct}
                      disabled={!productId}
                    >
                      <Plus size={16} />
                      Add
                    </button>
                  </div>
                  {items.length ? (
                    <div className="order-items">
                      {items.map((item) => {
                        const product = data.records.inventory.find(
                          (p) => p.id === item.productId,
                        );
                        return (
                          <div className="order-item" key={item.productId}>
                            <ProductThumb
                              product={product || { name: item.name }}
                            />
                            <div className="order-item-name">
                              <strong>{item.name}</strong>
                              <small>
                                {money(item.price, currency)} / unit
                              </small>
                            </div>
                            <div className="quantity-control">
                              <button
                                type="button"
                                aria-label={`Decrease ${item.name} quantity`}
                                onClick={() =>
                                  setItems((old) =>
                                    old.map((i) =>
                                      i.productId === item.productId
                                        ? {
                                            ...i,
                                            quantity: Math.max(
                                              1,
                                              i.quantity - 1,
                                            ),
                                          }
                                        : i,
                                    ),
                                  )
                                }
                              >
                                <Minus size={12} />
                              </button>
                              <input
                                aria-label={`${item.name} quantity`}
                                type="number"
                                min="1"
                                max="100000"
                                step="1"
                                value={item.quantity}
                                onChange={(e) =>
                                  setItems((old) =>
                                    old.map((i) =>
                                      i.productId === item.productId
                                        ? {
                                            ...i,
                                            quantity: Math.max(
                                              1,
                                              Number(e.target.value),
                                            ),
                                          }
                                        : i,
                                    ),
                                  )
                                }
                              />
                              <button
                                type="button"
                                aria-label={`Increase ${item.name} quantity`}
                                onClick={() =>
                                  setItems((old) =>
                                    old.map((i) =>
                                      i.productId === item.productId
                                        ? { ...i, quantity: i.quantity + 1 }
                                        : i,
                                    ),
                                  )
                                }
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                            <strong className="order-item-total">
                              {money(item.quantity * item.price, currency)}
                            </strong>
                            <button
                              type="button"
                              className="icon-button danger-icon"
                              aria-label={`Remove ${item.name}`}
                              onClick={() =>
                                setItems((old) =>
                                  old.filter(
                                    (i) => i.productId !== item.productId,
                                  ),
                                )
                              }
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="order-items-empty">
                      <ShoppingBag size={25} strokeWidth={1.5} />
                      <span>Your next sale is just a product away.</span>
                      <small>Choose a product from your catalog above.</small>
                    </div>
                  )}
                </div>
                <label className="form-field">
                  <span>Order date</span>
                  <input
                    type="date"
                    name="date"
                    required
                    defaultValue={
                      entity?.date || new Date().toISOString().slice(0, 10)
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Order status</span>
                  <select
                    name="status"
                    defaultValue={
                      entity?.status || (purchase ? "Ordered" : "Completed")
                    }
                  >
                    {(purchase
                      ? ["Ordered", "Received", "Cancelled"]
                      : ["Completed", "Pending", "Cancelled"]
                    ).map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>Payment status</span>
                  <select
                    name="payment"
                    defaultValue={entity?.payment || "Paid"}
                  >
                    <option>Paid</option>
                    <option>Unpaid</option>
                  </select>
                </label>
                <label className="form-field">
                  <span>
                    Notes <small>(optional)</small>
                  </span>
                  <input
                    name="notes"
                    defaultValue={entity?.notes || ""}
                    placeholder="Anything worth remembering?"
                    maxLength={2000}
                  />
                </label>
                <div className="order-total full-width">
                  <div>
                    <CheckCircle2 size={16} />
                    <span>
                      {purchase
                        ? "Stock updates automatically when received"
                        : "Completed sales update stock automatically"}
                    </span>
                  </div>
                  <span>
                    Total<strong>{money(total, currency)}</strong>
                  </span>
                </div>
              </>
            ) : (
              config.fields.map((field) => {
                const value =
                  (field.key === "image" && entity
                    ? entity.image || productArt(entity).src
                    : entity?.[field.key]) ??
                  field.defaultValue ??
                  (field.type === "date"
                    ? new Date().toISOString().slice(0, 10)
                    : "");
                return (
                  <label
                    className={`form-field ${field.full ? "full-width" : ""}`}
                    key={field.key}
                  >
                    <span>
                      {field.label}
                      {field.required && <em>*</em>}
                    </span>
                    {field.type === "select" ? (
                      <select
                        name={field.key}
                        defaultValue={String(value || field.options?.[0] || "")}
                        required={field.required}
                      >
                        {field.options?.map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                    ) : field.type === "textarea" ? (
                      <textarea
                        name={field.key}
                        rows={3}
                        defaultValue={String(value)}
                        placeholder={field.placeholder}
                        maxLength={2000}
                      />
                    ) : (
                      <input
                        name={field.key}
                        type={field.type || "text"}
                        defaultValue={String(value)}
                        required={field.required}
                        placeholder={field.placeholder}
                        min={field.min}
                        max={field.type === "number" ? 1e9 : undefined}
                        step={
                          field.type === "number"
                            ? ["stock", "reorderAt"].includes(field.key)
                              ? "1"
                              : "0.01"
                            : undefined
                        }
                        maxLength={field.type === "number" ? undefined : 500}
                      />
                    )}
                  </label>
                );
              })
            )}
          </div>
          {resource === "team" && (
            <p className="form-note">
              Team records help you organize staff. Adding a member does not
              send an email or grant account access.
            </p>
          )}
          {error && (
            <div className="form-error" role="alert">
              <AlertTriangle size={17} />
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button className="button button-primary" disabled={busy}>
            {busy ? (
              <Spinner />
            ) : entity ? (
              <CheckCircle2 size={16} />
            ) : (
              <Plus size={17} />
            )}{" "}
            {busy
              ? "Saving…"
              : entity
                ? "Save changes"
                : purchase
                  ? "Create purchase order"
                  : resource === "sales"
                    ? "Complete sale"
                    : `Add ${config.singular}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function RecordDetails({
  entity,
  onClose,
  onEdit,
  onDelete,
  onRestock,
}: {
  entity: Entity;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRestock: () => void;
}) {
  const { data } = useShop();
  if (!data) return null;
  const currency = data.user.settings.currency;
  const order = entity.resource === "sales" || entity.resource === "purchases";
  const printReceipt = () => {
    const popup = window.open("", "_blank", "width=700,height=800");
    if (!popup) return;
    const escape = (s: unknown) =>
      String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    popup.document.write(
      `<html><head><title>${escape(entity.name)} · KraTte</title><style>body{font:14px Arial,sans-serif;padding:50px;color:#20372d}h1{font-size:28px}table{width:100%;border-collapse:collapse;margin:32px 0}th,td{text-align:left;padding:14px 4px;border-bottom:1px solid #ddd}h2{text-align:right}.muted{color:#78837c}</style></head><body><h1>${escape(data.user.storeName)}</h1><p class="muted">${entity.resource === "sales" ? "Sales receipt" : "Purchase order"} ${escape(entity.name)}</p><p>${escape(dateLabel(entity.date))}</p><p>${escape(entity.customer || entity.supplier)}</p><table><tr><th>Product</th><th>Qty</th><th>Unit price</th><th>Total</th></tr>${(entity.items || []).map((i) => `<tr><td>${escape(i.name)}</td><td>${i.quantity}</td><td>${escape(money(i.price, currency))}</td><td>${escape(money(i.price * i.quantity, currency))}</td></tr>`).join("")}</table><h2>Total ${escape(money(entity.amount || 0, currency))}</h2><p>Payment: ${escape(entity.payment)}</p><p class="muted">${escape(entity.notes || "Thank you for supporting a local business.")}</p></body></html>`,
    );
    popup.addEventListener(
      "load",
      () => {
        popup.focus();
        popup.print();
      },
      { once: true },
    );
    popup.document.close();
  };
  return (
    <Modal
      title={
        order
          ? `Order ${entity.name}`
          : `${configs[entity.resource].singular[0].toUpperCase()}${configs[entity.resource].singular.slice(1)} details`
      }
      description="Everything you need to know, at a glance."
      onClose={onClose}
      wide={order}
    >
      <div className="modal-body">
        <div className="detail-hero">
          {entity.resource === "inventory" ? (
            <ProductThumb product={entity} large />
          ) : order ? (
            <div className="detail-order-icon">
              <ShoppingBag size={28} />
            </div>
          ) : (
            <Avatar name={entity.name} size="large" />
          )}
          <div>
            <h3>{entity.name}</h3>
            <p>
              {entity.sku ||
                entity.company ||
                entity.customer ||
                entity.supplier ||
                entity.email ||
                entity.category}
            </p>
            {entity.status && <Badge dot>{entity.status}</Badge>}
            {entity.resource === "inventory" && (
              <Badge dot>
                {!(entity.stock || 0)
                  ? "Out of stock"
                  : (entity.stock || 0) <= (entity.reorderAt || 0)
                    ? "Low stock"
                    : "In stock"}
              </Badge>
            )}
          </div>
        </div>
        {order ? (
          <>
            <div className="detail-grid">
              {[
                ["Date", dateLabel(entity.date)],
                ["Payment", entity.payment],
                [
                  entity.resource === "sales" ? "Channel" : "Expected delivery",
                  entity.channel && entity.resource === "sales"
                    ? entity.channel
                    : dateLabel(entity.dueDate),
                ],
              ].map(([key, value]) => (
                <div key={key}>
                  <span>{key}</span>
                  <strong>{value || "—"}</strong>
                </div>
              ))}
            </div>
            <div className="detail-line-items">
              <div className="detail-line-head">
                <span>Product</span>
                <span>Quantity</span>
                <span>Amount</span>
              </div>
              {entity.items?.map((i) => (
                <div key={i.productId}>
                  <span>
                    {i.name}
                    <small>{money(i.price, currency)} per unit</small>
                  </span>
                  <span>{i.quantity}</span>
                  <strong>{money(i.price * i.quantity, currency)}</strong>
                </div>
              ))}
              <div className="detail-total">
                <strong>Total</strong>
                <strong>{money(entity.amount || 0, currency)}</strong>
              </div>
            </div>
          </>
        ) : (
          <div className="detail-grid">
            {configs[entity.resource].fields
              .filter(
                (field) =>
                  !["name", "image", "notes", "items"].includes(field.key),
              )
              .map((field) => (
                <div className={field.full ? "full-width" : ""} key={field.key}>
                  <span>{field.label}</span>
                  <strong>
                    {entity[field.key] !== undefined && entity[field.key] !== ""
                      ? ["price", "cost", "balance", "amount"].includes(
                          field.key,
                        )
                        ? money(Number(entity[field.key]), currency)
                        : field.type === "date"
                          ? dateLabel(String(entity[field.key]))
                          : String(entity[field.key])
                      : "—"}
                  </strong>
                </div>
              ))}
          </div>
        )}
        {entity.notes && (
          <div className="detail-notes">
            <span>Notes</span>
            <p>{entity.notes}</p>
          </div>
        )}
        {entity.resource === "inventory" &&
          (entity.stock || 0) <= (entity.reorderAt || 0) && (
            <button className="restock-banner" onClick={onRestock}>
              <Package size={20} />
              <span>
                <strong>A little restock goes a long way.</strong>
                <small>Create a purchase order for this product.</small>
              </span>
              <ArrowRight size={18} />
            </button>
          )}
      </div>
      <div className="modal-footer">
        <button className="button button-danger-ghost" onClick={onDelete}>
          <Trash2 size={16} />
          Delete
        </button>
        <div className="button-group">
          {order && (
            <button className="button" onClick={printReceipt}>
              <Printer size={16} />
              Print {entity.resource === "sales" ? "receipt" : "order"}
            </button>
          )}
          <button className="button button-primary" onClick={onEdit}>
            <Pencil size={16} />
            Edit {configs[entity.resource].singular}
          </button>
        </div>
      </div>
    </Modal>
  );
}
export function DeleteDialog({
  entity,
  onClose,
  onDeleted,
}: {
  entity: Entity;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { deleteRecord } = useShop();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      title={`Delete ${configs[entity.resource].singular}?`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="modal-body">
        <div className="delete-warning">
          <AlertTriangle size={28} />
        </div>
        <p className="delete-description">
          You’re about to delete <strong>{entity.name}</strong>. This can’t be
          undone.
          {["sales", "purchases"].includes(entity.resource) &&
            " Any associated inventory movement will be reversed."}
        </p>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className="modal-footer">
        <button className="button" onClick={onClose} disabled={busy}>
          Keep record
        </button>
        <button
          className="button button-danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await deleteRecord(entity.resource, entity.id);
              onDeleted();
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Unable to delete record.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Spinner /> : <Trash2 size={16} />}Delete permanently
        </button>
      </div>
    </Modal>
  );
}
