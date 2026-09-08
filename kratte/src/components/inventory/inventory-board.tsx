"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Coffee,
  Download,
  Expand,
  Grid2X2,
  LayoutList,
  Leaf,
  Milk,
  Package,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Sprout,
  Table2,
  Trash2,
  Wheat,
  X,
} from "lucide-react";
import { useShop } from "@/components/shop-provider";
import { ActionMenu } from "@/components/action-menu";
import { EmptyState, Modal, PageHeading, Spinner } from "@/components/ui";
import {
  ProductCard,
  type ProductActions,
} from "@/components/inventory/product-card";
import { InventoryTable } from "@/components/inventory/inventory-table";
import { MasonryCell } from "@/components/inventory/masonry";
import { QuickEdit } from "@/components/inventory/quick-edit";
import { analytics } from "@/lib/analytics";
import { exportCsv, money, number, type Entity } from "@/lib/types";

type Tab = "all" | "attention" | "saved";
type View = "board" | "table";
type Density = "comfortable" | "compact";
type Props = Omit<ProductActions, "onQuickEdit"> & {
  initialFilter?: string;
  onCreate: () => void;
};
const categoryIcons: Record<string, typeof Leaf> = {
  Beverages: Coffee,
  Pantry: Wheat,
  "Fresh & dairy": Milk,
  Snacks: Sparkles,
  "Personal care": Sprout,
  Household: Package,
};

export function InventoryBoard({
  initialFilter = "",
  onCreate,
  ...actions
}: Props) {
  const { data, saveRecord, saveProfile, deleteRecord, notify, syncState } =
    useShop();
  const [tab, setTab] = useState<Tab>(
    initialFilter === "Low stock" ? "attention" : "all",
  );
  const [view, setView] = useState<View>(
    data?.user.settings.inventoryView || "board",
  );
  const [density, setDensity] = useState<Density>(
    data?.user.settings.inventoryDensity || "comfortable",
  );
  const [prefBusy, setPrefBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All categories");
  const [stockFilter, setStockFilter] = useState(
    ["Out of stock", "In stock"].includes(initialFilter)
      ? initialFilter
      : "All stock",
  );
  const [supplier, setSupplier] = useState("All suppliers");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState("store");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(24);
  const [page, setPage] = useState(1);
  const [quickEdit, setQuickEdit] = useState<Entity | null>(null);
  const [bulkDelete, setBulkDelete] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const pinLocks = useRef(new Set<string>());
  const products = useMemo(
    () => data?.records.inventory || [],
    [data?.records.inventory],
  );
  const lowStock = products.filter((p) => (p.stock || 0) <= (p.reorderAt || 0));
  const savedCount = products.filter((p) => p.pinned).length;
  const selectedProducts = products.filter((p) => selected.has(p.id));

  useEffect(() => {
    setTab(initialFilter === "Low stock" ? "attention" : "all");
    setStockFilter(
      ["Out of stock", "In stock"].includes(initialFilter)
        ? initialFilter
        : "All stock",
    );
  }, [initialFilter]);
  useEffect(() => {
    setView(data?.user.settings.inventoryView || "board");
  }, [data?.user.settings.inventoryView]);
  useEffect(() => {
    setDensity(data?.user.settings.inventoryDensity || "comfortable");
  }, [data?.user.settings.inventoryDensity]);
  useEffect(() => {
    setPage(1);
    setLimit(24);
  }, [query, category, tab, stockFilter, supplier, minPrice, maxPrice, sort]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.key === "/" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) &&
        !document.querySelector('[role="dialog"]')
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, []);

  const productStats = useMemo(
    () => (data ? analytics(data, 30).topProducts : []),
    [data],
  );
  const sales = useMemo(
    () => new Map(productStats.map((p) => [p.id, p.sold.units])),
    [productStats],
  );
  const incoming = useMemo(() => {
    const result = new Map<string, { order: Entity; quantity: number }>();
    for (const order of data?.records.purchases || []) {
      if (order.status !== "Ordered") continue;
      for (const item of order.items || []) {
        const existing = result.get(item.productId);
        result.set(item.productId, {
          order: existing?.order || order,
          quantity: (existing?.quantity || 0) + item.quantity,
        });
      }
    }
    return result;
  }, [data?.records.purchases]);
  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category || "Other"))],
    [products],
  );
  const filtered = useMemo(
    () =>
      products
        .filter((product) => {
          const stock = product.stock || 0;
          const low = stock <= (product.reorderAt || 0);
          if (
            (tab === "attention" && !low) ||
            (tab === "saved" && !product.pinned)
          )
            return false;
          if (
            category !== "All categories" &&
            (product.category || "Other") !== category
          )
            return false;
          if (supplier !== "All suppliers" && product.supplier !== supplier)
            return false;
          if (
            (stockFilter === "In stock" && stock === 0) ||
            (stockFilter === "Low stock" && !low) ||
            (stockFilter === "Out of stock" && stock !== 0)
          )
            return false;
          if (
            (minPrice && (product.price || 0) < Number(minPrice)) ||
            (maxPrice && (product.price || 0) > Number(maxPrice))
          )
            return false;
          return [product.name, product.sku, product.category, product.supplier]
            .join(" ")
            .toLowerCase()
            .includes(query.trim().toLowerCase());
        })
        .sort((a, b) => {
          if (sort === "name") return a.name.localeCompare(b.name);
          if (sort === "stock")
            return (
              (a.stock || 0) - (b.stock || 0) || a.name.localeCompare(b.name)
            );
          if (sort === "price-low") return (a.price || 0) - (b.price || 0);
          if (sort === "price-high") return (b.price || 0) - (a.price || 0);
          if (sort === "bestselling")
            return (sales.get(b.id) || 0) - (sales.get(a.id) || 0);
          return (a.sku || a.name).localeCompare(b.sku || b.name);
        }),
    [
      products,
      tab,
      category,
      supplier,
      stockFilter,
      minPrice,
      maxPrice,
      query,
      sort,
      sales,
    ],
  );
  if (!data) return null;
  const currency = data.user.settings.currency;
  const pageSize = 10;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const visible =
    view === "board"
      ? filtered.slice(0, limit)
      : filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const filterCount = [
    stockFilter !== "All stock",
    supplier !== "All suppliers",
    !!minPrice,
    !!maxPrice,
  ].filter(Boolean).length;
  const resetFilters = () => {
    setQuery("");
    setCategory("All categories");
    setStockFilter("All stock");
    setSupplier("All suppliers");
    setMinPrice("");
    setMaxPrice("");
    setTab("all");
  };
  const toggleSelection = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectVisible = () =>
    setSelected((current) => {
      const next = new Set(current);
      const all = visible.every((p) => next.has(p.id));
      visible.forEach((p) => (all ? next.delete(p.id) : next.add(p.id)));
      return next;
    });
  const exportProducts = (rows: Entity[]) => {
    if (!rows.length) {
      notify("No products to export. Try clearing your filters.", "error");
      return;
    }
    exportCsv(rows, "inventory");
    notify(`${rows.length} products exported. Your whole shelf, to go.`);
  };
  const togglePin = async (product: Entity) => {
    if (pinLocks.current.has(product.id)) return;
    pinLocks.current.add(product.id);
    setBusyIds((current) => new Set([...current, product.id]));
    try {
      await saveRecord(
        "inventory",
        { name: product.name, pinned: !product.pinned },
        product.id,
        {
          successMessage: product.pinned
            ? "Removed from saved products."
            : "Saved. Your everyday essentials, a little closer.",
        },
      );
    } catch {
      /* The shared provider restores this card and displays the error. */
    } finally {
      pinLocks.current.delete(product.id);
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(product.id);
        return next;
      });
    }
  };
  const changePreference = async (next: {
    inventoryView?: View;
    inventoryDensity?: Density;
    showInventorySummary?: boolean;
  }) => {
    if (prefBusy) return;
    const previousView = view;
    const previousDensity = density;
    if (next.inventoryView) setView(next.inventoryView);
    if (next.inventoryDensity) setDensity(next.inventoryDensity);
    setPrefBusy(true);
    try {
      await saveProfile({ settings: next });
    } catch (failure) {
      setView(previousView);
      setDensity(previousDensity);
      notify(
        failure instanceof Error
          ? failure.message
          : "Couldn’t save this view preference.",
        "error",
      );
    } finally {
      setPrefBusy(false);
    }
  };
  const allActions: ProductActions = { ...actions, onQuickEdit: setQuickEdit };
  const onSaveSelected = async () => {
    if (bulkBusy) return;
    setBulkBusy(true);
    try {
      for (const product of selectedProducts.filter((p) => !p.pinned))
        await saveRecord(
          "inventory",
          { name: product.name, pinned: true },
          product.id,
          { silent: true },
        );
      notify("Your selected products are saved together.");
      setSelected(new Set());
      setSelecting(false);
    } catch {
      /* Preserve remaining selection for a retry. */
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="inventory-workspace">
      <PageHeading
        title="Inventory"
        description={`${number(products.length)} products in your store.`}
        actions={
          <>
            <button className="button button-primary" onClick={onCreate}>
              <Plus size={17} />
              Add product
            </button>
          </>
        }
      />
      {data.user.settings.showInventorySummary && (
        <section className="calm-inventory-summary" aria-label="Stock overview">
          <div>
            <span>Products</span>
            <strong>{number(products.length)}</strong>
          </div>
          <div>
            <span>Units on hand</span>
            <strong>
              {number(
                products.reduce(
                  (sum, product) => sum + (product.stock || 0),
                  0,
                ),
              )}
            </strong>
          </div>
          <div>
            <span>Inventory value</span>
            <strong>
              {money(
                products.reduce(
                  (sum, product) =>
                    sum + (product.stock || 0) * (product.cost || 0),
                  0,
                ),
                currency,
                0,
              )}
            </strong>
          </div>
          <button
            onClick={() => {
              resetFilters();
              setTab("attention");
            }}
          >
            <span>Low stock</span>
            <strong>
              {lowStock.length}
              <ArrowUpRight size={14} />
            </strong>
          </button>
        </section>
      )}

      <div className="inventory-nav-row">
        <div
          className="inventory-board-tabs"
          role="tablist"
          aria-label="Inventory collections"
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            const tabs = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>(
                '[role="tab"]',
              ),
            );
            const index = tabs.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? tabs.length - 1
                  : (index +
                      (event.key === "ArrowRight" ? 1 : -1) +
                      tabs.length) %
                    tabs.length;
            event.preventDefault();
            tabs[next]?.focus();
            tabs[next]?.click();
          }}
        >
          <button
            role="tab"
            aria-selected={tab === "all"}
            tabIndex={tab === "all" ? 0 : -1}
            aria-controls="inventory-results"
            className={tab === "all" ? "active" : ""}
            onClick={() => setTab("all")}
          >
            All products
          </button>
          <button
            role="tab"
            aria-selected={tab === "attention"}
            tabIndex={tab === "attention" ? 0 : -1}
            aria-controls="inventory-results"
            className={tab === "attention" ? "active" : ""}
            onClick={() => setTab("attention")}
          >
            Needs attention
            {lowStock.length > 0 && (
              <span className="attention-count">{lowStock.length}</span>
            )}
          </button>
          <button
            role="tab"
            aria-selected={tab === "saved"}
            tabIndex={tab === "saved" ? 0 : -1}
            aria-controls="inventory-results"
            className={tab === "saved" ? "active" : ""}
            onClick={() => setTab("saved")}
          >
            Saved{savedCount > 0 && <span>{savedCount}</span>}
          </button>
        </div>
        <div
          className="inventory-view-switch"
          role="group"
          aria-label="Inventory layout"
        >
          <button
            className={view === "board" ? "active" : ""}
            aria-label="Board view"
            aria-pressed={view === "board"}
            disabled={prefBusy}
            onClick={() => void changePreference({ inventoryView: "board" })}
          >
            <Grid2X2 size={15} />
            <span>Board</span>
          </button>
          <button
            className={view === "table" ? "active" : ""}
            aria-label="Table view"
            aria-pressed={view === "table"}
            disabled={prefBusy}
            onClick={() => void changePreference({ inventoryView: "table" })}
          >
            <Table2 size={15} />
            <span>Table</span>
          </button>
        </div>
      </div>

      <div className="inventory-toolbar">
        <label className="inventory-search">
          <Search size={18} />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search products…"
            aria-label="Search Inventory"
          />
          {query ? (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear inventory search"
            >
              <X size={15} />
            </button>
          ) : (
            <kbd>/</kbd>
          )}
        </label>
        <div className="inventory-toolbar-right">
          <label className="calm-category-select">
            <span className="sr-only">Product category</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              aria-label="Product category"
            >
              <option>All categories</option>
              {categories.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <button
            className={`button inventory-filter-button ${filtersOpen || filterCount ? "is-active" : ""}`}
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-controls="inventory-filter-panel"
          >
            <SlidersHorizontal size={15} />
            Filters{filterCount > 0 && <span>{filterCount}</span>}
          </button>
          <ActionMenu
            label="More inventory actions"
            actions={[
              {
                id: "select",
                label: selecting
                  ? "Done selecting products"
                  : "Select products",
                icon: CheckCheck,
                onSelect: () => {
                  setSelecting((value) => !value);
                  setSelected(new Set());
                },
              },
              ...(view === "board"
                ? [
                    {
                      id: "density",
                      label:
                        density === "compact"
                          ? "Switch to comfortable cards"
                          : "Switch to compact cards",
                      icon: Expand,
                      disabled: prefBusy,
                      onSelect: () =>
                        void changePreference({
                          inventoryDensity:
                            density === "compact" ? "comfortable" : "compact",
                        }),
                    },
                  ]
                : []),
              {
                id: "export",
                label: "Export",
                icon: Download,
                onSelect: () => exportProducts(filtered),
              },
              {
                id: "summary",
                label: data.user.settings.showInventorySummary
                  ? "Hide stock overview"
                  : "Show stock overview",
                icon: LayoutList,
                disabled: prefBusy,
                onSelect: () =>
                  void changePreference({
                    showInventorySummary:
                      !data.user.settings.showInventorySummary,
                  }),
              },
            ]}
          />
        </div>
      </div>
      {filtersOpen && (
        <div className="inventory-filter-panel" id="inventory-filter-panel">
          <label className="calm-filter-sort">
            Sort by
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              aria-label="Sort inventory"
            >
              <option value="store">Store order</option>
              <option value="name">Name: A–Z</option>
              <option value="stock">Stock: low to high</option>
              <option value="price-low">Price: low to high</option>
              <option value="price-high">Price: high to low</option>
              <option value="bestselling">Bestselling first</option>
            </select>
          </label>

          <label>
            Stock status
            <select
              value={stockFilter}
              onChange={(event) => setStockFilter(event.target.value)}
            >
              {["All stock", "In stock", "Low stock", "Out of stock"].map(
                (option) => (
                  <option key={option}>{option}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Supplier
            <select
              value={supplier}
              onChange={(event) => setSupplier(event.target.value)}
            >
              <option>All suppliers</option>
              {[
                ...new Set(products.map((p) => p.supplier).filter(Boolean)),
              ].map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <label>
            Min. price
            <input
              type="number"
              min="0"
              step="0.01"
              value={minPrice}
              onChange={(event) => setMinPrice(event.target.value)}
              placeholder="0.00"
            />
          </label>
          <label>
            Max. price
            <input
              type="number"
              min="0"
              step="0.01"
              value={maxPrice}
              onChange={(event) => setMaxPrice(event.target.value)}
              placeholder="Any price"
            />
          </label>
          <button className="text-link" onClick={resetFilters}>
            Clear filters
            <X size={13} />
          </button>
        </div>
      )}

      {!filtersOpen &&
        (query ||
          category !== "All categories" ||
          filterCount > 0 ||
          sort !== "store") && (
          <div className="calm-filter-context" role="status">
            <span>
              {filtered.length} matching{" "}
              {filtered.length === 1 ? "product" : "products"}
            </span>
            <button
              onClick={() => {
                resetFilters();
                setSort("store");
              }}
            >
              Clear filters
              <X size={12} />
            </button>
          </div>
        )}

      {(selecting || selectedProducts.length > 0) && (
        <div className="inventory-selection-bar">
          <button className="inventory-select-all" onClick={selectVisible}>
            <span
              className={
                visible.length > 0 && visible.every((p) => selected.has(p.id))
                  ? "checked"
                  : ""
              }
            >
              {visible.length > 0 &&
                visible.every((p) => selected.has(p.id)) && <Check size={12} />}
            </span>
            {selectedProducts.length
              ? `${selectedProducts.length} selected`
              : "Select products"}
          </button>
          <div>
            <button
              disabled={!selectedProducts.length || bulkBusy}
              onClick={() => exportProducts(selectedProducts)}
            >
              <Download size={14} />
              Export
            </button>
            <button
              disabled={!selectedProducts.length || bulkBusy}
              onClick={() => void onSaveSelected()}
            >
              {bulkBusy ? <Spinner size={14} /> : <Bookmark size={14} />}Save
              selected
            </button>
            <button
              className="selection-delete"
              disabled={!selectedProducts.length || bulkBusy}
              onClick={() => {
                setBulkError("");
                setBulkDelete(true);
              }}
            >
              <Trash2 size={14} />
              Delete
            </button>
            <button
              aria-label="Clear selection"
              onClick={() => {
                setSelected(new Set());
                setSelecting(false);
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <section
        id="inventory-results"
        role="tabpanel"
        aria-label="Inventory products"
      >
        {filtered.length > 0 ? (
          view === "board" ? (
            <div
              className={`inventory-masonry ${density === "compact" ? "is-compact" : ""}`}
              aria-label="Product board"
            >
              {visible.map((product, index) => (
                <MasonryCell key={product.id}>
                  <ProductCard
                    product={product}
                    currency={currency}
                    selecting={selecting}
                    selected={selected.has(product.id)}
                    pinBusy={busyIds.has(product.id)}
                    onSelect={() => toggleSelection(product.id)}
                    onPin={() => void togglePin(product)}
                    incoming={incoming.get(product.id)}
                    showFollowup={tab === "attention"}
                    eager={index < 4}
                    {...allActions}
                  />
                </MasonryCell>
              ))}
            </div>
          ) : (
            <InventoryTable
              products={visible}
              currency={currency}
              selected={selected}
              onSelect={toggleSelection}
              onSelectAll={selectVisible}
              onPin={(product) => void togglePin(product)}
              busyIds={busyIds}
              {...allActions}
            />
          )
        ) : (
          <div className="inventory-empty">
            <EmptyState
              title={
                tab === "saved" && !savedCount
                  ? "Your everyday favorites, all together."
                  : tab === "attention" && !lowStock.length
                    ? "All caught up. That feels good."
                    : !products.length
                      ? "Let’s make these shelves yours."
                      : "Nothing in this little corner. Yet."
              }
              description={
                tab === "saved" && !savedCount
                  ? "Tap the bookmark on any product to keep your go-to items just a little closer."
                  : tab === "attention" && !lowStock.length
                    ? "Every product is above its low-stock threshold. Your next customer is in good hands."
                    : !products.length
                      ? "Add your first product. Give it a photo, a price, and a place to shine."
                      : "Try a different search or clear your filters to see the rest of your collection."
              }
              action={
                <button
                  className="button button-primary"
                  onClick={!products.length ? onCreate : resetFilters}
                >
                  {!products.length ? (
                    <>
                      <Plus size={16} />
                      Add your first product
                    </>
                  ) : (
                    <>
                      Explore all products
                      <ArrowRight size={15} />
                    </>
                  )}
                </button>
              }
            />
          </div>
        )}
      </section>
      {view === "board" && filtered.length > visible.length && (
        <div className="inventory-load-more">
          <button
            className="button"
            onClick={() => setLimit((current) => current + 24)}
          >
            Load more products
            <ChevronDown size={16} />
          </button>
          <span>
            {visible.length} of {filtered.length} products
          </span>
        </div>
      )}
      {view === "table" && filtered.length > 0 && (
        <div className="inventory-table-pagination">
          <span>
            Showing {(safePage - 1) * pageSize + 1}–
            {Math.min(safePage * pageSize, filtered.length)} of{" "}
            {filtered.length} products
          </span>
          <div>
            <button
              className="button button-small"
              disabled={safePage === 1}
              onClick={() => setPage((value) => value - 1)}
            >
              <ChevronLeft size={15} />
              Previous
            </button>
            <span>
              {safePage} / {pages}
            </span>
            <button
              className="button button-small"
              disabled={safePage === pages}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
      <div className="inventory-board-footer">
        <span>
          <i className={syncState === "ready" ? "synced" : ""} />
          {syncState === "syncing"
            ? "Updating inventory…"
            : syncState === "ready"
              ? "Inventory is up to date"
              : "Your current view · reconnect to sync changes"}
        </span>
      </div>

      {quickEdit && (
        <QuickEdit
          product={quickEdit}
          onClose={() => setQuickEdit(null)}
          onFullEdit={() => {
            actions.onEdit(
              data.records.inventory.find((p) => p.id === quickEdit.id) ||
                quickEdit,
            );
            setQuickEdit(null);
          }}
        />
      )}
      {bulkDelete && (
        <Modal
          title={`Delete ${selectedProducts.length} products?`}
          description="Only delete products you no longer need. Order history is protected."
          onClose={() => {
            if (!bulkBusy) setBulkDelete(false);
          }}
        >
          <div className="modal-body">
            <p className="delete-description">
              These products will be permanently removed. Products linked to
              sales or purchase orders cannot be deleted.
            </p>
            <div className="inventory-delete-list">
              {selectedProducts.slice(0, 6).map((product) => (
                <span key={product.id}>{product.name}</span>
              ))}
              {selectedProducts.length > 6 && (
                <small>and {selectedProducts.length - 6} more</small>
              )}
            </div>
            {bulkError && (
              <div className="form-error" role="alert">
                {bulkError}
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button
              className="button"
              disabled={bulkBusy}
              onClick={() => setBulkDelete(false)}
            >
              Keep products
            </button>
            <button
              className="button button-danger"
              disabled={bulkBusy}
              onClick={async () => {
                setBulkBusy(true);
                setBulkError("");
                try {
                  for (const product of selectedProducts) {
                    await deleteRecord("inventory", product.id);
                    setSelected((current) => {
                      const next = new Set(current);
                      next.delete(product.id);
                      return next;
                    });
                  }
                  setBulkDelete(false);
                  setSelecting(false);
                } catch (failure) {
                  setBulkError(
                    failure instanceof Error
                      ? failure.message
                      : "Some products couldn’t be deleted.",
                  );
                } finally {
                  setBulkBusy(false);
                }
              }}
            >
              {bulkBusy ? <Spinner /> : <Trash2 size={15} />}Delete products
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function InventorySkeleton() {
  return (
    <div
      className="inventory-loading"
      aria-label="Loading your product board"
      aria-busy="true"
    >
      <div className="inventory-loading-heading">
        <div>
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-subtitle" />
        </div>
        <div className="skeleton inventory-loading-button" />
      </div>
      <div className="skeleton inventory-loading-toolbar" />
      <div className="inventory-loading-grid">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((item, index) => (
          <div
            key={item}
            className="skeleton"
            style={{ height: [357, 290, 334, 410][index % 4] }}
          />
        ))}
      </div>
    </div>
  );
}
