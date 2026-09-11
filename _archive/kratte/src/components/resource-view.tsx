"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Plus,
  Download,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowDownWideNarrow,
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  Package,
  Users,
  Receipt,
  X,
  LayoutList,
  Grid2X2,
  AlertTriangle,
} from "lucide-react";
import { useShop } from "@/components/shop-provider";
import {
  Avatar,
  Badge,
  EmptyState,
  Modal,
  PageHeading,
  ProductThumb,
  Spinner,
} from "@/components/ui";
import {
  configs,
  dateLabel,
  exportCsv,
  money,
  number,
  type Entity,
  type Resource,
} from "@/lib/types";

type Props = {
  resource: Resource;
  initialFilter?: string;
  onCreate: () => void;
  onView: (entity: Entity) => void;
  onEdit: (entity: Entity) => void;
  onDelete: (entity: Entity) => void;
};
export function ResourceView({
  resource,
  initialFilter = "",
  onCreate,
  onView,
  onEdit,
  onDelete,
}: Props) {
  const { data, notify, deleteRecord, refresh } = useShop();
  const config = configs[resource];
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState(initialFilter || config.tabs[0]);
  const [category, setCategory] = useState("All categories");
  const [filters, setFilters] = useState(false);
  const [sort, setSort] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<string | null>(null);
  const [gallery, setGallery] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);
  useEffect(() => {
    setTab(initialFilter || configs[resource].tabs[0]);
    setSearch("");
    setCategory("All categories");
    setPage(1);
    setSelected(new Set());
    setMenu(null);
    setGallery(false);
  }, [resource, initialFilter]);
  useEffect(() => {
    setPage(1);
  }, [search, tab, category, sort]);
  const rows = useMemo(
    () => data?.records[resource] || [],
    [data?.records, resource],
  );
  const filtered = useMemo(
    () =>
      rows
        .filter((item) => {
          const q = search.toLowerCase();
          const text = [
            item.name,
            item.sku,
            item.email,
            item.company,
            item.customer,
            item.supplier,
            item.category,
          ]
            .join(" ")
            .toLowerCase();
          if (!text.includes(q)) return false;
          if (category !== "All categories" && item.category !== category)
            return false;
          if (tab.startsWith("All")) return true;
          if (resource === "inventory")
            return tab === "Out of stock"
              ? (item.stock || 0) === 0
              : tab === "Low stock"
                ? (item.stock || 0) <= (item.reorderAt || 0)
                : (item.stock || 0) > (item.reorderAt || 0);
          if (["Retail", "Wholesale"].includes(tab))
            return item.channel === tab;
          return item.status === tab;
        })
        .sort((a, b) =>
          sort
            ? a.name.localeCompare(b.name)
            : resource === "inventory"
              ? (a.sku || "").localeCompare(b.sku || "")
              : (b.date || "").localeCompare(a.date || "") ||
                b.name.localeCompare(a.name),
        ),
    [rows, search, tab, category, resource, sort],
  );
  if (!data) return null;
  const currency = data.user.settings.currency;
  const perPage = gallery ? 8 : 8;
  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice((safePage - 1) * perPage, safePage * perPage);
  const total = rows.reduce((s, r) => s + (r.amount || 0), 0);
  const low = data.records.inventory.filter(
    (p) => (p.stock || 0) <= (p.reorderAt || 0),
  ).length;
  const summaries =
    resource === "inventory"
      ? [
          {
            label: "Total products",
            value: number(rows.length),
            icon: Package,
          },
          {
            label: "Units on hand",
            value: number(rows.reduce((s, r) => s + (r.stock || 0), 0)),
            icon: LayoutList,
          },
          {
            label: "Inventory value",
            value: money(
              rows.reduce((s, r) => s + (r.stock || 0) * (r.cost || 0), 0),
              currency,
            ),
            icon: Receipt,
          },
          {
            label: "Need attention",
            value: `${low} products`,
            icon: AlertTriangle,
          },
        ]
      : resource === "sales"
        ? [
            {
              label: "Total orders",
              value: number(rows.length),
              icon: Receipt,
            },
            {
              label: "Completed revenue",
              value: money(
                rows
                  .filter((r) => r.status === "Completed")
                  .reduce((s, r) => s + (r.amount || 0), 0),
                currency,
              ),
              icon: Receipt,
            },
            {
              label: "Awaiting completion",
              value: number(rows.filter((r) => r.status === "Pending").length),
              icon: Package,
            },
          ]
        : resource === "customers"
          ? [
              {
                label: "Total customers",
                value: number(rows.length),
                icon: Users,
              },
              {
                label: "Wholesale partners",
                value: number(
                  rows.filter((r) => r.channel === "Wholesale").length,
                ),
                icon: Package,
              },
              {
                label: "Outstanding balances",
                value: money(
                  rows.reduce((s, r) => s + (r.balance || 0), 0),
                  currency,
                ),
                icon: Receipt,
              },
            ]
          : resource === "purchases"
            ? [
                {
                  label: "Total purchases",
                  value: number(rows.length),
                  icon: Package,
                },
                {
                  label: "Purchase value",
                  value: money(total, currency),
                  icon: Receipt,
                },
                {
                  label: "On the way",
                  value: number(
                    rows.filter((r) => r.status === "Ordered").length,
                  ),
                  icon: Package,
                },
              ]
            : resource === "expenses"
              ? [
                  {
                    label: "Total expenses",
                    value: money(total, currency),
                    icon: Receipt,
                  },
                  {
                    label: "Paid expenses",
                    value: money(
                      rows
                        .filter((r) => r.status === "Paid")
                        .reduce((s, r) => s + (r.amount || 0), 0),
                      currency,
                    ),
                    icon: Receipt,
                  },
                  {
                    label: "Outstanding",
                    value: money(
                      rows
                        .filter((r) => r.status === "Unpaid")
                        .reduce((s, r) => s + (r.amount || 0), 0),
                      currency,
                    ),
                    icon: AlertTriangle,
                  },
                ]
              : [
                  {
                    label:
                      resource === "team" ? "Team members" : "Total suppliers",
                    value: number(rows.length),
                    icon: Users,
                  },
                  {
                    label: "Active",
                    value: number(
                      rows.filter((r) => r.status === "Active").length,
                    ),
                    icon: Users,
                  },
                  {
                    label:
                      resource === "team" ? "Invited" : "Product categories",
                    value:
                      resource === "team"
                        ? number(
                            rows.filter((r) => r.status === "Invited").length,
                          )
                        : number(new Set(rows.map((r) => r.category)).size),
                    icon: Package,
                  },
                ];
  const headers =
    resource === "inventory"
      ? ["Product", "Category", "Stock on hand", "Selling price", "Status"]
      : resource === "sales"
        ? ["Order", "Customer", "Channel", "Amount", "Status"]
        : resource === "customers"
          ? ["Customer", "Business", "Type", "Phone", "Balance"]
          : resource === "suppliers"
            ? ["Supplier", "Category", "Email", "Phone", "Status"]
            : resource === "purchases"
              ? [
                  "Purchase order",
                  "Supplier",
                  "Expected delivery",
                  "Amount",
                  "Status",
                ]
              : resource === "expenses"
                ? ["Expense", "Category", "Date", "Amount", "Status"]
                : ["Team member", "Role", "Email", "Phone", "Status"];
  const stockStatus = (r: Entity) =>
    !(r.stock || 0)
      ? "Out of stock"
      : (r.stock || 0) <= (r.reorderAt || 0)
        ? "Low stock"
        : "In stock";
  const cells = (r: Entity) => {
    if (resource === "inventory")
      return (
        <>
          <td>
            <div className="product-cell">
              <ProductThumb product={r} />
              <div>
                <span className="cell-primary">{r.name}</span>
                <span className="cell-subtext">
                  {r.sku} <i>·</i> {r.unit || "unit"}
                </span>
              </div>
            </div>
          </td>
          <td>
            <span className="category-label">{r.category}</span>
          </td>
          <td>
            <span
              className={`stock-count ${stockStatus(r) !== "In stock" ? "stock-low" : ""}`}
            >
              {number(r.stock || 0)} <small>units</small>
            </span>
            <div className="stock-bar">
              <span
                className={stockStatus(r) !== "In stock" ? "low" : ""}
                style={{
                  width: `${Math.min(100, ((r.stock || 0) / Math.max((r.reorderAt || 20) * 5, 1)) * 100)}%`,
                }}
              />
            </div>
          </td>
          <td className="amount-cell">{money(r.price || 0, currency)}</td>
          <td>
            <Badge dot>{stockStatus(r)}</Badge>
          </td>
        </>
      );
    if (resource === "sales" || resource === "purchases")
      return (
        <>
          <td>
            <span className="order-id">{r.name}</span>
            <span className="cell-subtext">{dateLabel(r.date)}</span>
          </td>
          <td>
            <div className="person-cell">
              <Avatar
                name={r.customer || r.supplier || "Walk-in customer"}
                size="small"
              />
              <span className="cell-primary">{r.customer || r.supplier}</span>
            </div>
          </td>
          <td>
            {resource === "sales" ? (
              <Badge>{r.channel}</Badge>
            ) : (
              dateLabel(r.dueDate)
            )}
          </td>
          <td className="amount-cell">
            {money(r.amount || 0, currency)}
            <span className="cell-subtext">{r.payment}</span>
          </td>
          <td>
            <Badge dot>{r.status}</Badge>
          </td>
        </>
      );
    if (resource === "expenses")
      return (
        <>
          <td>
            <div className="product-cell">
              <span className="expense-icon">
                <Receipt size={18} />
              </span>
              <span className="cell-primary">{r.name}</span>
            </div>
          </td>
          <td>
            <span className="category-label">{r.category}</span>
          </td>
          <td>{dateLabel(r.date)}</td>
          <td className="amount-cell">{money(r.amount || 0, currency)}</td>
          <td>
            <Badge dot>{r.status}</Badge>
          </td>
        </>
      );
    return (
      <>
        <td>
          <div className="person-cell">
            <Avatar name={r.name} />
            <div>
              <span className="cell-primary">{r.name}</span>
              <span className="cell-subtext">
                {resource === "suppliers"
                  ? r.company
                  : resource === "team"
                    ? "Store team"
                    : r.email}
              </span>
            </div>
          </div>
        </td>
        <td>
          {resource === "customers" ? (
            r.company || "Individual customer"
          ) : resource === "suppliers" ? (
            <span className="category-label">{r.category}</span>
          ) : (
            r.role
          )}
        </td>
        <td>
          {resource === "customers" ? <Badge>{r.channel}</Badge> : r.email}
        </td>
        <td className="phone-cell">{r.phone || "—"}</td>
        <td>
          {resource === "customers" ? (
            <span
              className={(r.balance || 0) > 0 ? "balance-due" : "amount-cell"}
            >
              {money(r.balance || 0, currency)}
            </span>
          ) : (
            <Badge dot>{r.status}</Badge>
          )}
        </td>
      </>
    );
  };
  const exportRows = (items: Entity[]) => {
    if (!items.length) {
      notify("No records to export. Try a different filter.", "error");
      return;
    }
    exportCsv(items, resource);
    notify(`${items.length} records exported as CSV.`);
  };
  return (
    <>
      <PageHeading
        title={config.title}
        description={config.description}
        actions={
          <>
            <button className="button" onClick={() => exportRows(filtered)}>
              <Download size={16} />
              Export
            </button>
            <button className="button button-primary" onClick={onCreate}>
              <Plus size={17} />
              {["sales", "purchases"].includes(resource) ? "New" : "Add"}{" "}
              {config.singular}
            </button>
          </>
        }
      />
      <div className="calm-resource-summary-line">
        <span>{number(rows.length)} records</span>
        <button
          aria-expanded={summaryOpen}
          aria-controls={`summary-${resource}`}
          onClick={() => setSummaryOpen((value) => !value)}
        >
          {summaryOpen ? "Hide summary" : "Show summary"}
          <ChevronDown size={14} className={summaryOpen ? "is-open" : ""} />
        </button>
      </div>
      {summaryOpen && (
        <div
          id={`summary-${resource}`}
          className={`resource-summary summary-${summaries.length}`}
        >
          {summaries.map((summary) => (
            <div key={summary.label}>
              <span className="resource-summary-icon">
                <summary.icon size={19} strokeWidth={1.6} />
              </span>
              <div>
                <span>{summary.label}</span>
                <strong>{summary.value}</strong>
              </div>
            </div>
          ))}
        </div>
      )}
      <section className="card resource-card">
        <div className="resource-tabs">
          {config.tabs.map((label, i) => (
            <button
              key={label}
              className={tab === label ? "active" : ""}
              onClick={() => setTab(label)}
            >
              {label}
              {i === 0 && <span>{rows.length}</span>}
            </button>
          ))}
          {!config.tabs.includes(tab) && (
            <button className="active" onClick={() => setTab(config.tabs[0])}>
              {tab}
              <X size={13} />
            </button>
          )}
        </div>
        <div className="table-toolbar">
          <label className="search-field">
            <Search size={17} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${resource === "inventory" ? "products" : resource === "sales" ? "orders" : resource}…`}
              aria-label={`Search ${config.title}`}
            />
            {search && (
              <button
                className="icon-button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </label>
          <div className="toolbar-actions">
            <button
              className={`button button-small ${filters ? "button-active" : ""}`}
              onClick={() => setFilters(!filters)}
            >
              <SlidersHorizontal size={15} />
              Filters
            </button>
            <button
              className={`button button-small ${sort ? "button-active" : ""}`}
              onClick={() => setSort(!sort)}
            >
              <ArrowDownWideNarrow size={16} />
              <span>{sort ? "A–Z" : "Sort"}</span>
            </button>
            {resource === "inventory" && (
              <div className="view-toggle">
                <button
                  className={!gallery ? "active" : ""}
                  onClick={() => setGallery(false)}
                  aria-label="Table view"
                >
                  <LayoutList size={17} />
                </button>
                <button
                  className={gallery ? "active" : ""}
                  onClick={() => setGallery(true)}
                  aria-label="Product grid view"
                >
                  <Grid2X2 size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
        {filters && (
          <div className="filter-panel">
            <label>
              Status / type
              <select value={tab} onChange={(e) => setTab(e.target.value)}>
                {[
                  ...new Set([
                    ...config.tabs,
                    ...(["sales", "customers"].includes(resource)
                      ? ["Retail", "Wholesale"]
                      : []),
                  ]),
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            {["inventory", "suppliers", "expenses"].includes(resource) && (
              <label>
                Category
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option>All categories</option>
                  {[
                    ...new Set(rows.map((r) => r.category).filter(Boolean)),
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            )}
            <button
              className="text-link"
              onClick={() => {
                setCategory("All categories");
                setTab(config.tabs[0]);
                setSearch("");
              }}
            >
              Reset filters
              <X size={13} />
            </button>
          </div>
        )}
        {selected.size > 0 && (
          <div className="selection-toolbar">
            <span>
              <CheckIcon />
              {selected.size} selected
            </span>
            <button
              onClick={() => exportRows(rows.filter((r) => selected.has(r.id)))}
            >
              <Download size={14} />
              Export selected
            </button>
            <button
              className="danger-text"
              onClick={() => {
                setBulk(true);
                setBulkError("");
              }}
            >
              <Trash2 size={14} />
              Delete selected
            </button>
            <button
              className="selection-clear"
              onClick={() => setSelected(new Set())}
            >
              <X size={15} />
              Clear
            </button>
          </div>
        )}
        {filtered.length ? (
          gallery ? (
            <div className="product-gallery">
              {visible.map((product) => (
                <button
                  key={product.id}
                  className="gallery-product"
                  onClick={() => onView(product)}
                >
                  <div className="gallery-image">
                    <ProductThumb product={product} large />
                    <Badge dot>{stockStatus(product)}</Badge>
                  </div>
                  <div className="gallery-product-body">
                    <small>{product.category}</small>
                    <strong>{product.name}</strong>
                    <span>{product.unit || "Per unit"}</span>
                    <div>
                      <strong>{money(product.price || 0, currency)}</strong>
                      <small>{product.stock} in stock</small>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="table-scroll resource-table-scroll">
              <table className="data-table resource-table">
                <thead>
                  <tr>
                    <th className="checkbox-cell">
                      <input
                        type="checkbox"
                        aria-label="Select all records on this page"
                        checked={
                          visible.length > 0 &&
                          visible.every((r) => selected.has(r.id))
                        }
                        onChange={(e) => {
                          const next = new Set(selected);
                          visible.forEach((r) =>
                            e.target.checked
                              ? next.add(r.id)
                              : next.delete(r.id),
                          );
                          setSelected(next);
                        }}
                      />
                    </th>
                    {headers.map((header) => (
                      <th key={header}>{header}</th>
                    ))}
                    <th className="last-cell" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" &&
                          event.target === event.currentTarget
                        )
                          onView(row);
                      }}
                      key={row.id}
                      className={selected.has(row.id) ? "selected-row" : ""}
                      onClick={() => onView(row)}
                    >
                      <td
                        className="checkbox-cell"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.name}`}
                          checked={selected.has(row.id)}
                          onChange={() => {
                            const next = new Set(selected);
                            if (next.has(row.id)) next.delete(row.id);
                            else next.add(row.id);
                            setSelected(next);
                          }}
                        />
                      </td>
                      {cells(row)}
                      <td
                        className="row-action-cell"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="dropdown-wrap">
                          <button
                            className="icon-button"
                            onClick={() =>
                              setMenu(menu === row.id ? null : row.id)
                            }
                            aria-label={`Actions for ${row.name}`}
                            aria-expanded={menu === row.id}
                          >
                            <MoreHorizontal size={19} />
                          </button>
                          {menu === row.id && (
                            <div className="dropdown-menu row-menu">
                              <button
                                onClick={() => {
                                  setMenu(null);
                                  onView(row);
                                }}
                              >
                                <Eye size={15} />
                                View details
                              </button>
                              <button
                                onClick={() => {
                                  setMenu(null);
                                  onEdit(row);
                                }}
                              >
                                <Pencil size={15} />
                                Edit {config.singular}
                              </button>
                              <button
                                className="danger-text"
                                onClick={() => {
                                  setMenu(null);
                                  onDelete(row);
                                }}
                              >
                                <Trash2 size={15} />
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <EmptyState
            title={
              rows.length
                ? `No ${config.singular}s found`
                : `Your next chapter starts here`
            }
            description={
              rows.length
                ? "Try a different search or clear your filters to see more results."
                : `Add your first ${config.singular} and make this space your own.`
            }
            action={
              <button
                className="button"
                onClick={
                  rows.length
                    ? () => {
                        setSearch("");
                        setTab(config.tabs[0]);
                        setCategory("All categories");
                      }
                    : onCreate
                }
              >
                {rows.length ? "Clear filters" : `Add ${config.singular}`}
              </button>
            }
          />
        )}
        <div className="pagination">
          <span>
            Showing{" "}
            <strong>
              {filtered.length ? (safePage - 1) * perPage + 1 : 0}–
              {Math.min(safePage * perPage, filtered.length)}
            </strong>{" "}
            of <strong>{number(filtered.length)}</strong>{" "}
            {resource === "inventory" ? "products" : "records"}
          </span>
          <div>
            <button
              className="button button-small"
              disabled={safePage === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={16} />
              Previous
            </button>
            <span className="page-number">
              {safePage} <span>/ {pages}</span>
            </span>
            <button
              className="button button-small"
              disabled={safePage === pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
      {bulk && (
        <Modal
          title={`Delete ${selected.size} records?`}
          description="This action cannot be undone. Linked inventory movements will be reversed."
          onClose={() => {
            if (!busy) setBulk(false);
          }}
        >
          <div className="modal-body">
            <p>
              Selected records will be permanently removed. Products linked to
              order history are protected and cannot be deleted.
            </p>
            {bulkError && (
              <div className="form-error" role="alert">
                {bulkError}
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button
              className="button"
              onClick={() => setBulk(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className="button button-danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  for (const id of selected) {
                    await deleteRecord(resource, id);
                    setSelected((old) => {
                      const next = new Set(old);
                      next.delete(id);
                      return next;
                    });
                  }
                  setBulk(false);
                } catch (e) {
                  setBulkError(
                    e instanceof Error
                      ? e.message
                      : "Some records could not be deleted.",
                  );
                  await refresh().catch(() => {});
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Spinner /> : <Trash2 size={16} />}Delete records
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function CheckIcon() {
  return <span className="selection-check">✓</span>;
}
