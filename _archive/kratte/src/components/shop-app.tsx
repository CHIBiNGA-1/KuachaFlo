"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { navigateFresh } from "@/lib/navigation";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  UsersRound,
  Truck,
  ClipboardList,
  Receipt,
  ChartNoAxesCombined,
  Settings2,
  Search,
  Bell,
  ChevronDown,
  ChevronsUpDown,
  Store,
  Sparkles,
  ArrowUpRight,
  ArrowRight,
  CircleHelp,
  Menu,
  X,
  Plus,
  LogOut,
  ShieldCheck,
  Check,
  Command,
  Boxes,
  TrendingUp,
  Keyboard,
  BookOpen,
  Mail,
  RefreshCw,
  LockKeyhole,
} from "lucide-react";
import { api, useShop } from "@/components/shop-provider";
import {
  Avatar,
  DashboardSkeleton,
  EmptyState,
  Logo,
  Modal,
  Spinner,
} from "@/components/ui";
import { OverviewContent as Overview } from "@/components/overview-content";
import { SyncNotice } from "@/components/sync-notice";

import {
  InventoryBoard,
  InventorySkeleton,
} from "@/components/inventory/inventory-board";

import {
  DeleteDialog,
  RecordDetails,
  RecordEditor,
} from "@/components/record-dialog";
import { analytics } from "@/lib/analytics";
import {
  configs,
  money,
  resources,
  type Entity,
  type Resource,
  type Section,
} from "@/lib/types";

const ResourceView = dynamic(
  () =>
    import("@/components/resource-view").then((module) => module.ResourceView),
  { loading: () => <DashboardSkeleton /> },
);
const Reports = dynamic(
  () => import("@/components/reports").then((module) => module.Reports),
  { loading: () => <DashboardSkeleton /> },
);
const Settings = dynamic(
  () => import("@/components/settings").then((module) => module.Settings),
  { loading: () => <DashboardSkeleton /> },
);

const navigation = [
  {
    label: "MANAGE",
    items: [
      { id: "overview", label: "Overview", icon: LayoutDashboard },
      { id: "inventory", label: "Inventory", icon: Package },
      { id: "sales", label: "Sales & orders", icon: ShoppingCart },
      { id: "customers", label: "Customers", icon: UsersRound },
      { id: "suppliers", label: "Suppliers", icon: Truck },
      { id: "purchases", label: "Purchase orders", icon: ClipboardList },
    ],
  },
  {
    label: "UNDERSTAND",
    items: [
      { id: "expenses", label: "Expenses", icon: Receipt },
      { id: "reports", label: "Reports & insights", icon: ChartNoAxesCombined },
    ],
  },
  {
    label: "WORKSPACE",
    items: [
      { id: "team", label: "Team members", icon: UsersRound },
      { id: "settings", label: "Settings", icon: Settings2 },
    ],
  },
];
export function ShopApp({ initialFilter = "" }: { initialFilter?: string }) {
  const {
    data,
    loading,
    error,
    syncState,
    refresh,
    reconnect,
    saveProfile,
    notify,
  } = useShop();
  const router = useRouter();
  const pathname = usePathname();
  const section = (pathname.split("/")[1] || "overview") as Section;
  const [mobile, setMobile] = useState(false);
  const [storeMenu, setStoreMenu] = useState(false);
  const [profileMenu, setProfileMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [editor, setEditor] = useState<{
    resource: Resource;
    entity?: Entity;
    initialProduct?: Entity;
  } | null>(null);
  const [details, setDetails] = useState<Entity | null>(null);
  const [deleting, setDeleting] = useState<Entity | null>(null);
  const navigate = (target: Section, filter?: string) => {
    router.push(
      (target === "overview" ? "/" : `/${target}`) +
        (filter ? `?filter=${encodeURIComponent(filter)}` : ""),
    );
    setMobile(false);
    setSearchOpen(false);
    setNotificationsOpen(false);
    setProfileMenu(false);
    setStoreMenu(false);
  };
  const openCreate = (resource: Resource = "sales") => {
    setEditor({ resource });
    setSearchOpen(false);
    setHelpOpen(false);
    setMobile(false);
  };
  const openDetails = (entity: Entity) => {
    setDetails(entity);
    setSearchOpen(false);
    setNotificationsOpen(false);
  };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
      const target = event.target as HTMLElement;
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target.isContentEditable
      )
        return;
      if (
        event.key === "n" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !document.querySelector('[role="dialog"]')
      ) {
        event.preventDefault();
        setEditor({ resource: "sales" });
      }
      if (event.key === "Escape") {
        setMobile(false);
        setStoreMenu(false);
        setProfileMenu(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    setSearchIndex(0);
  }, [query]);
  const lowStock =
    data?.records.inventory.filter(
      (p) => (p.stock || 0) <= (p.reorderAt || 0),
    ) || [];
  const notifications = useMemo(() => {
    if (!data) return [];
    const list: {
      id: string;
      title: string;
      description: string;
      type: "stock" | "order" | "digest";
      record?: Entity;
    }[] = [];
    if (data.user.settings.lowStockAlerts)
      for (const p of data.records.inventory.filter(
        (p) => (p.stock || 0) <= (p.reorderAt || 0),
      ))
        list.push({
          id: `stock-${p.id}-${p.stock}`,
          title: `${p.name} ${p.stock ? "is running low" : "is out of stock"}`,
          description: `${p.stock || 0} units left · Reorder threshold: ${p.reorderAt || 0}. A quick restock keeps you ready.`,
          type: "stock",
          record: p,
        });
    if (data.user.settings.orderNotifications)
      for (const order of data.records.sales
        .filter((s) => s.status === "Pending")
        .slice(0, 5))
        list.push({
          id: `order-${order.id}`,
          title: `${order.name} is waiting for you`,
          description: `${order.customer} · ${money(order.amount || 0, data.user.settings.currency)} · Ready to review.`,
          type: "order",
          record: order,
        });
    if (data.user.settings.weeklyDigest)
      list.push({
        id: `digest-${Math.floor(Date.now() / (7 * 86400000))}`,
        title: "Your weekly little wins",
        description: `${money(analytics(data, 7).revenue, data.user.settings.currency)} in completed sales over the last 7 days. See what’s working in your reports.`,
        type: "digest",
      });
    return list.filter(
      (n) => !data.user.settings.dismissedNotifications?.includes(n.id),
    );
  }, [data]);
  const navTitle =
    navigation.flatMap((g) => g.items).find((item) => item.id === section)
      ?.label || "Overview";
  const results = query.trim()
    ? [
        ...navigation
          .flatMap((g) => g.items)
          .filter((n) => n.label.toLowerCase().includes(query.toLowerCase()))
          .map((n) => ({
            id: `nav-${n.id}`,
            title: n.label,
            subtitle: "Go to page",
            icon: n.icon,
            action: () => navigate(n.id as Section),
          })),
        ...(data
          ? resources.flatMap((resource) =>
              data.records[resource]
                .filter((r) =>
                  [r.name, r.customer, r.supplier, r.company, r.email, r.sku]
                    .join(" ")
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .slice(0, 5)
                .map((record) => ({
                  id: record.id,
                  title: record.name,
                  subtitle: `${configs[resource].singular} · ${record.customer || record.supplier || record.email || record.sku || record.category || "View details"}`,
                  icon:
                    resource === "inventory"
                      ? Package
                      : resource === "sales"
                        ? ShoppingCart
                        : UsersRound,
                  action: () => openDetails(record),
                })),
            )
          : []),
      ].slice(0, 9)
    : [
        {
          id: "new-sale",
          title: "Record a new sale",
          subtitle: "Make someone’s day. Keep your stock in sync.",
          icon: ShoppingCart,
          action: () => openCreate("sales"),
        },
        {
          id: "new-product",
          title: "Add a product",
          subtitle: "Make room for your next bestseller.",
          icon: Package,
          action: () => openCreate("inventory"),
        },
        {
          id: "new-expense",
          title: "Record an expense",
          subtitle: "Keep every dollar accounted for.",
          icon: Receipt,
          action: () => openCreate("expenses"),
        },
        {
          id: "go-reports",
          title: "Explore your reports",
          subtitle: "A little clarity for your next big decision.",
          icon: ChartNoAxesCombined,
          action: () => navigate("reports"),
        },
      ];
  return (
    <div className="app-shell calm-shell">
      {mobile && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <Link href="/" aria-label="KraTte home">
            <Logo />
          </Link>
          <button
            className="icon-button mobile-close"
            onClick={() => setMobile(false)}
            aria-label="Close navigation"
          >
            <X size={19} />
          </button>
        </div>
        <div className="store-switcher-wrap">
          <button
            className="store-switcher"
            onClick={() => setStoreMenu(!storeMenu)}
            aria-expanded={storeMenu}
          >
            <span className="store-icon">
              <Store size={20} strokeWidth={1.7} />
            </span>
            <span>
              <strong>{data?.user.storeName || "The Everyday Store"}</strong>
            </span>
            <ChevronsUpDown size={14} />
          </button>
          {storeMenu && (
            <div className="dropdown-menu store-menu">
              <p className="menu-label">YOUR WORKSPACE</p>
              <button onClick={() => navigate("overview")}>
                <Store size={16} />
                <span>{data?.user.storeName || "Your store"}</span>
                <Check size={14} />
              </button>
              <button onClick={() => navigate("settings")}>
                <Settings2 size={16} />
                Workspace settings
              </button>
              {data?.user.isDemo && (
                <Link href="/login?mode=register">
                  <ShieldCheck size={16} />
                  Make this workspace yours
                </Link>
              )}
            </div>
          )}
        </div>
        <nav className="sidebar-navigation" aria-label="Main navigation">
          {navigation.map((group) => (
            <div className="nav-group" key={group.label}>
              {group.items.map((item) => (
                <Link
                  key={item.id}
                  href={item.id === "overview" ? "/" : `/${item.id}`}
                  className={`nav-item ${section === item.id ? "active" : ""}`}
                  onClick={() => setMobile(false)}
                  aria-current={section === item.id ? "page" : undefined}
                >
                  <item.icon size={19} strokeWidth={1.65} />
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="sidebar-help" onClick={() => setHelpOpen(true)}>
            <CircleHelp size={18} strokeWidth={1.65} />
            <span>Help & getting started</span>
            <ArrowUpRight size={14} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="header-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={22} />
            </button>
            <div className="breadcrumb">
              <span>Workspace</span>
              <span className="breadcrumb-divider">/</span>
              <strong>{navTitle}</strong>
            </div>
            <Link href="/" className="mobile-brand">
              <Logo small />
            </Link>
          </div>
          <div className="header-actions">
            <button
              className="header-search"
              onClick={() => {
                setSearchOpen(true);
                setQuery("");
              }}
            >
              <Search size={17} />
              <span>Search anything…</span>
              <kbd>⌘ K</kbd>
            </button>
            <button
              className={`notification-button icon-button ${notifications.length ? "has-notifications" : ""}`}
              onClick={() => setNotificationsOpen(true)}
              aria-label={`Notifications, ${notifications.length} unread`}
            >
              <Bell size={20} strokeWidth={1.7} />
              {notifications.length > 0 && <i />}
            </button>
            <div className="header-divider" />
            <div className="profile-wrap">
              <button
                className="profile-button"
                onClick={() => setProfileMenu(!profileMenu)}
                aria-expanded={profileMenu}
                aria-label="Account menu"
              >
                <span className="profile-avatar-wrap">
                  <Avatar name={data?.user.name || "Alex Morgan"} />
                </span>
                <span className="profile-name">
                  <strong>{data?.user.name || "Alex Morgan"}</strong>
                </span>
                <ChevronDown size={14} />
              </button>
              {profileMenu && (
                <>
                  <button
                    className="dropdown-dismiss"
                    onClick={() => setProfileMenu(false)}
                    aria-label="Close account menu"
                  />
                  <div className="dropdown-menu profile-menu">
                    <div className="profile-menu-heading">
                      <strong>{data?.user.name}</strong>
                      <span>{data?.user.email}</span>
                      {data?.user.isDemo && (
                        <small>Private demo workspace</small>
                      )}
                    </div>
                    <button onClick={() => navigate("settings")}>
                      <Settings2 size={16} />
                      Account & settings
                    </button>
                    <a
                      href={`${process.env.NEXT_PUBLIC_KUACHAFLO_URL || "https://kuachaflo.vercel.app"}/billing`}
                      onClick={() => setProfileMenu(false)}
                    >
                      <Sparkles size={16} />
                      Plan & billing
                    </a>
                    {data?.user.isDemo ? (
                      <>
                        <Link href="/login?mode=register">
                          <ShieldCheck size={16} />
                          Create your account
                          <ArrowUpRight size={14} />
                        </Link>
                        <Link href="/login">
                          <LogOut size={16} />
                          Sign in to an account
                        </Link>
                      </>
                    ) : (
                      <button
                        onClick={async () => {
                          try {
                            await api("/api/auth", {
                              method: "POST",
                              body: JSON.stringify({ action: "logout" }),
                            });
                            navigateFresh("/login");
                          } catch (e) {
                            notify(
                              e instanceof Error
                                ? e.message
                                : "Unable to sign out.",
                              "error",
                            );
                          }
                        }}
                      >
                        <LogOut size={16} />
                        Sign out
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="page-content" id="main-content">
          <SyncNotice />
          {loading || (!data && !error) ? (
            section === "inventory" ? (
              <InventorySkeleton />
            ) : (
              <DashboardSkeleton />
            )
          ) : error && !data ? (
            <div className="card workspace-error">
              <EmptyState
                title="Let’s get you reconnected"
                description={error}
                action={
                  <button
                    className="button button-primary"
                    onClick={
                      syncState === "session-expired"
                        ? reconnect
                        : () => void refresh().catch(() => {})
                    }
                  >
                    <RefreshCw size={16} />
                    {syncState === "session-expired"
                      ? "Sign in again"
                      : "Try again"}
                  </button>
                }
              />
            </div>
          ) : section === "overview" ? (
            <Overview
              onCreate={() => openCreate("sales")}
              onNavigate={navigate}
              onView={openDetails}
            />
          ) : section === "reports" ? (
            <Reports onNavigate={navigate} />
          ) : section === "settings" ? (
            <Settings />
          ) : section === "inventory" ? (
            <InventoryBoard
              initialFilter={initialFilter}
              onCreate={() => openCreate("inventory")}
              onView={openDetails}
              onEdit={(entity) => setEditor({ resource: "inventory", entity })}
              onDelete={setDeleting}
              onSale={(product) =>
                setEditor({ resource: "sales", initialProduct: product })
              }
              onRestock={(product) =>
                setEditor({ resource: "purchases", initialProduct: product })
              }
            />
          ) : resources.includes(section as Resource) ? (
            <ResourceView
              key={section}
              resource={section as Resource}
              initialFilter={initialFilter}
              onCreate={() => openCreate(section as Resource)}
              onView={openDetails}
              onEdit={(entity) =>
                setEditor({ resource: entity.resource, entity })
              }
              onDelete={setDeleting}
            />
          ) : null}
        </main>
      </div>
      {editor && (
        <RecordEditor
          key={
            editor.entity?.id ||
            `${editor.resource}-${editor.initialProduct?.id || "new"}`
          }
          resource={editor.resource}
          entity={editor.entity}
          initialProduct={editor.initialProduct}
          onClose={() => setEditor(null)}
        />
      )}
      {details && (
        <RecordDetails
          entity={details}
          onClose={() => setDetails(null)}
          onEdit={() => {
            setEditor({ resource: details.resource, entity: details });
            setDetails(null);
          }}
          onDelete={() => {
            setDeleting(details);
            setDetails(null);
          }}
          onRestock={() => {
            setEditor({ resource: "purchases", initialProduct: details });
            setDetails(null);
          }}
        />
      )}{" "}
      {deleting && (
        <DeleteDialog
          entity={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => setDeleting(null)}
        />
      )}
      {searchOpen && (
        <Modal
          title="Find a little clarity"
          description="Search your products, people, orders, and more."
          onClose={() => setSearchOpen(false)}
          className="command-modal"
        >
          <div className="command-input">
            <Search size={21} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Where would you like to go?"
              aria-label="Search your workspace"
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSearchIndex((i) => Math.min(i + 1, results.length - 1));
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSearchIndex((i) => Math.max(0, i - 1));
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  results[searchIndex]?.action();
                }
              }}
            />
            <kbd>ESC</kbd>
          </div>
          <div className="command-results">
            <p className="menu-label">
              {query ? `${results.length} RESULTS` : "A FEW QUICK SHORTCUTS"}
            </p>
            {results.length ? (
              results.map((result, i) => (
                <button
                  key={result.id}
                  className={searchIndex === i ? "active" : ""}
                  onMouseEnter={() => setSearchIndex(i)}
                  onClick={result.action}
                >
                  <span className="command-result-icon">
                    <result.icon size={20} />
                  </span>
                  <span>
                    <strong>{result.title}</strong>
                    <small>{result.subtitle}</small>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              ))
            ) : (
              <EmptyState
                title="No matches just yet"
                description="Try a product name, SKU, customer, or order number."
              />
            )}
          </div>
          <div className="command-footer">
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> to navigate
            </span>
            <span>
              <kbd>↵</kbd> to open
            </span>
            <Logo small />
          </div>
        </Modal>
      )}
      {notificationsOpen && (
        <Modal
          title="A little heads-up"
          description={`${notifications.length} ${notifications.length === 1 ? "update" : "updates"} to keep your business moving.`}
          onClose={() => setNotificationsOpen(false)}
          className="notifications-modal"
        >
          <div className="notifications-toolbar">
            <span>YOUR WORKSPACE UPDATES</span>
            {notifications.length > 0 && (
              <button
                className="text-link"
                onClick={async () => {
                  try {
                    await saveProfile({
                      settings: {
                        dismissedNotifications: [
                          ...(data?.user.settings.dismissedNotifications || []),
                          ...notifications.map((n) => n.id),
                        ],
                      },
                    });
                    notify(
                      "You’re all caught up. Notifications marked as read.",
                    );
                  } catch (e) {
                    notify(
                      e instanceof Error
                        ? e.message
                        : "Unable to mark notifications as read.",
                      "error",
                    );
                  }
                }}
              >
                <Check size={15} />
                Mark all as read
              </button>
            )}
          </div>
          <div className="notifications-list">
            {notifications.length ? (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() =>
                    n.record ? openDetails(n.record) : navigate("reports")
                  }
                >
                  <span className={`notification-icon ${n.type}`}>
                    {n.type === "stock" ? (
                      <Package size={20} />
                    ) : n.type === "order" ? (
                      <ShoppingCart size={20} />
                    ) : (
                      <TrendingUp size={20} />
                    )}
                  </span>
                  <span>
                    <strong>{n.title}</strong>
                    <p>{n.description}</p>
                    <small>
                      {n.type === "stock"
                        ? "Inventory alert"
                        : n.type === "order"
                          ? "Order reminder"
                          : "Weekly insight"}
                      <span>·</span>Just for you
                    </small>
                  </span>
                  <i className="live-dot" />
                </button>
              ))
            ) : (
              <EmptyState
                title="All caught up. Nicely done."
                description="We’ll give you a heads-up when something needs your attention."
              />
            )}
          </div>
          <div className="notification-footer">
            <button className="text-link" onClick={() => navigate("settings")}>
              Manage notification preferences
              <ArrowUpRight size={14} />
            </button>
          </div>
        </Modal>
      )}
      {helpOpen && (
        <Modal
          title="A good place to start"
          description="A few small steps toward a more organized business."
          onClose={() => setHelpOpen(false)}
        >
          <div className="help-content">
            <div className="help-intro">
              <BookOpen size={26} />
              <p>
                KraTte brings your store’s moving parts together. Your private
                demo is already stocked—try anything. Your changes are saved.
              </p>
            </div>
            {[
              {
                title: "Get your shelves organized",
                text: "Add products, set selling prices, and choose a low-stock threshold.",
                resource: "inventory" as Resource,
                icon: Package,
              },
              {
                title: "Make your first sale",
                text: "Choose a customer and products. Completed orders update stock automatically.",
                resource: "sales" as Resource,
                icon: ShoppingCart,
              },
              {
                title: "Stay ahead of your next restock",
                text: "Create a purchase order. Mark it received when the shipment arrives.",
                resource: "purchases" as Resource,
                icon: Truck,
              },
              {
                title: "Keep your relationships close",
                text: "Manage wholesale partners, retail customers, and outstanding balances.",
                resource: "customers" as Resource,
                icon: UsersRound,
              },
            ].map((item) => (
              <button
                className="help-step"
                key={item.title}
                onClick={() => openCreate(item.resource)}
              >
                <span>
                  <item.icon size={20} />
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.text}</p>
                </div>
                <ArrowRight size={16} />
              </button>
            ))}
            <div className="keyboard-help">
              <span>
                <Keyboard size={17} />A faster way around
              </span>
              <div>
                <span>
                  Search anything<kbd>⌘ / Ctrl K</kbd>
                </span>
                <span>
                  New sale<kbd>N</kbd>
                </span>
                <span>
                  Close dialog<kbd>Esc</kbd>
                </span>
              </div>
            </div>
            <p className="help-note">
              <LockKeyhole size={15} />
              Demo data is private to this browser. Create an account to keep
              access across devices.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
