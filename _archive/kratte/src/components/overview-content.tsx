"use client";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  Package,
  ShoppingBag,
  Truck,
  CheckCircle2,
  Plus,
} from "lucide-react";
import { useShop } from "@/components/shop-provider";
import {
  Badge,
  CardHeading,
  EmptyState,
  PageHeading,
  ProductThumb,
} from "@/components/ui";
import { Growth, PeriodPicker, RevenueChart } from "@/components/overview";
import { analytics, type Period } from "@/lib/analytics";
import {
  dateLabel,
  money,
  number,
  type Entity,
  type Section,
} from "@/lib/types";

export function OverviewContent({
  onCreate,
  onNavigate,
  onView,
}: {
  onCreate: () => void;
  onNavigate: (section: Section, filter?: string) => void;
  onView: (entity: Entity) => void;
}) {
  const { data, saveProfile, notify, syncState } = useShop();
  const [period, setPeriod] = useState<Period>("30");
  const [weekly, setWeekly] = useState(true);
  const [preferenceBusy, setPreferenceBusy] = useState(false);
  const [measure, setMeasure] = useState<"Revenue" | "Orders">("Revenue");
  const stats = useMemo(
    () => (data ? analytics(data, Number(period)) : null),
    [data, period],
  );
  if (!data || !stats) return null;
  const currency = data.user.settings.currency;
  const insightsOpen = data.user.settings.showDashboardInsights === true;
  const pending = data.records.sales.filter(
    (order) => order.status === "Pending",
  ).length;
  const incoming = data.records.purchases.filter(
    (order) => order.status === "Ordered",
  ).length;
  const reviewItems = [
    {
      id: "inventory" as Section,
      filter: "Low stock",
      icon: Package,
      title: "Low stock",
      detail: "Products ready for a restock",
      count: stats.lowStock.length,
    },
    {
      id: "sales" as Section,
      filter: "Pending",
      icon: ShoppingBag,
      title: "Pending orders",
      detail: "Orders waiting to be completed",
      count: pending,
    },
    {
      id: "purchases" as Section,
      filter: "Ordered",
      icon: Truck,
      title: "Incoming deliveries",
      detail: "Purchase orders on the way",
      count: incoming,
    },
  ].filter((item) => item.count > 0);
  const metrics = [
    {
      label: "Total revenue",
      value: money(stats.revenue, currency),
      growth: stats.growth,
    },
    {
      label: "Total orders",
      value: number(stats.orders.length),
      growth: stats.orderGrowth,
    },
    {
      label: "Gross profit",
      value: money(stats.profit, currency),
      growth: stats.profitGrowth,
    },
    {
      label: "Average order",
      value: money(
        stats.sales.length ? stats.revenue / stats.sales.length : 0,
        currency,
      ),
      note: "per completed order",
    },
  ];
  const retail =
    measure === "Revenue"
      ? stats.retail
      : stats.sales.filter((sale) => sale.channel === "Retail").length;
  const wholesale =
    measure === "Revenue"
      ? stats.wholesale
      : stats.sales.filter((sale) => sale.channel !== "Retail").length;
  const channelTotal = retail + wholesale;
  return (
    <div className="calm-overview">
      <PageHeading
        title="Overview"
        description={`Welcome back, ${data.user.name.split(" ")[0]}. Here’s your store at a glance.`}
        actions={
          <>
            <PeriodPicker value={period} onChange={setPeriod} />
            <button className="button button-primary" onClick={onCreate}>
              <Plus size={16} />
              New sale
            </button>
          </>
        }
      />
      <section
        className="stats-grid calm-metrics"
        aria-label="Store performance"
      >
        {metrics.map((metric) => (
          <div className="stat-card" key={metric.label}>
            <div className="stat-top">
              <span>{metric.label}</span>
            </div>
            <div className="stat-middle">
              <strong>{metric.value}</strong>
            </div>
            <div className="stat-bottom">
              {metric.growth !== undefined ? (
                <>
                  <Growth value={metric.growth} />
                  <span>vs. previous period</span>
                </>
              ) : (
                <span>{metric.note}</span>
              )}
            </div>
          </div>
        ))}
      </section>
      <div className="calm-overview-main">
        <section className="card revenue-card calm-revenue">
          <CardHeading
            title="Revenue"
            action={
              <select
                className="small-select"
                value={weekly ? "weekly" : "daily"}
                onChange={(event) => setWeekly(event.target.value === "weekly")}
                aria-label="Chart interval"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            }
          />
          <div className="calm-chart-caption">
            <span>Last {period} days</span>
            <div className="chart-legend">
              <span>
                <i className="legend-dot current" />
                This period
              </span>
              <span>
                <i className="legend-dash" />
                Previous period
              </span>
            </div>
          </div>
          <RevenueChart
            points={stats.points}
            currency={currency}
            weekly={weekly}
          />
        </section>
        <section className="card calm-review">
          <CardHeading title="To review" />
          {reviewItems.length ? (
            <div className="calm-review-list">
              {reviewItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id, item.filter)}
                  aria-label={`Review ${item.count} ${item.title.toLowerCase()}`}
                >
                  <item.icon size={18} strokeWidth={1.6} />
                  <span>
                    <strong>{item.title}</strong>
                  </span>
                  <span className="review-count">{item.count}</span>
                  <ArrowUpRight size={15} />
                </button>
              ))}
            </div>
          ) : (
            <div className="calm-all-clear">
              <CheckCircle2 size={24} />
              <strong>You’re all caught up.</strong>
              <p>Nothing needs your attention right now.</p>
            </div>
          )}
          <div className="calm-review-footnote">
            Live updates from across your store.
          </div>
        </section>
      </div>
      <section className="card recent-card calm-recent">
        <CardHeading
          title="Recent orders"
          action={
            <button className="text-link" onClick={() => onNavigate("sales")}>
              View all orders
              <ArrowRight size={14} />
            </button>
          }
        />
        {stats.orders.length ? (
          <div className="table-scroll">
            <table className="data-table recent-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th className="last-cell">
                    <span className="sr-only">View order</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.orders.slice(0, 4).map((order) => (
                  <tr
                    key={order.id}
                    tabIndex={0}
                    onClick={() => onView(order)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") onView(order);
                    }}
                  >
                    <td>
                      <span className="order-id">{order.name}</span>
                    </td>
                    <td>
                      <span className="cell-primary">
                        {order.customer || "Walk-in customer"}
                      </span>
                    </td>
                    <td className="calm-date-cell">{dateLabel(order.date)}</td>
                    <td className="amount-cell">
                      {money(order.amount || 0, currency)}
                    </td>
                    <td>
                      <Badge dot>{order.status}</Badge>
                    </td>
                    <td className="last-cell">
                      <ArrowUpRight size={14} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No orders in this period"
            description="Record a sale or choose a different date range."
            action={
              <button className="button" onClick={onCreate}>
                New sale
              </button>
            }
          />
        )}
      </section>
      <section className="calm-insights-disclosure">
        <button
          className="calm-disclosure-trigger"
          aria-expanded={insightsOpen}
          aria-controls="overview-extra-insights"
          disabled={preferenceBusy}
          onClick={async () => {
            setPreferenceBusy(true);
            try {
              await saveProfile({
                settings: { showDashboardInsights: !insightsOpen },
              });
            } catch (error) {
              notify(
                error instanceof Error
                  ? error.message
                  : "Couldn’t save this display preference.",
                "error",
              );
            } finally {
              setPreferenceBusy(false);
            }
          }}
        >
          <span>{insightsOpen ? "Less detail" : "More insights"}</span>
          <small>Sales channels & top products</small>
          <ChevronDown size={16} className={insightsOpen ? "is-open" : ""} />
        </button>
        {insightsOpen && (
          <div className="calm-extra-insights" id="overview-extra-insights">
            <section className="card calm-channel">
              <CardHeading
                title="Sales by channel"
                action={
                  <select
                    className="small-select"
                    value={measure}
                    onChange={(event) =>
                      setMeasure(event.target.value as "Revenue" | "Orders")
                    }
                    aria-label="Channel measure"
                  >
                    <option>Revenue</option>
                    <option>Orders</option>
                  </select>
                }
              />
              <div className="calm-channel-bars">
                {[
                  { name: "Retail", amount: retail },
                  { name: "Wholesale", amount: wholesale },
                ].map((channel) => (
                  <button
                    key={channel.name}
                    onClick={() => onNavigate("sales", channel.name)}
                  >
                    <span>
                      <strong>{channel.name}</strong>
                      <span>
                        {measure === "Revenue"
                          ? money(channel.amount, currency)
                          : number(channel.amount)}
                        <small>
                          {channelTotal
                            ? Math.round((channel.amount / channelTotal) * 100)
                            : 0}
                          %
                        </small>
                      </span>
                    </span>
                    <span className="calm-channel-track">
                      <i
                        style={{
                          width: `${channelTotal ? (channel.amount / channelTotal) * 100 : 0}%`,
                        }}
                      />
                    </span>
                  </button>
                ))}
              </div>
              <button
                className="calm-card-link"
                onClick={() => onNavigate("reports")}
              >
                Open full reports
                <ArrowRight size={14} />
              </button>
            </section>
            <section className="card products-card calm-bestsellers">
              <CardHeading
                title="Top-selling products"
                action={
                  <button
                    className="text-link"
                    onClick={() => onNavigate("inventory")}
                  >
                    Inventory
                    <ArrowRight size={14} />
                  </button>
                }
              />
              <div className="top-products">
                {stats.topProducts
                  .filter((product) => product.sold.units > 0)
                  .slice(0, 4)
                  .map((product) => (
                    <button
                      className="top-product"
                      key={product.id}
                      onClick={() => onView(product)}
                    >
                      <ProductThumb product={product} />
                      <span className="top-product-info">
                        <strong>{product.name}</strong>
                        <small>{number(product.sold.units)} units sold</small>
                      </span>
                      <span className="top-product-amount">
                        {money(product.sold.revenue, currency, 0)}
                      </span>
                    </button>
                  ))}
              </div>
              {!stats.sales.length && (
                <EmptyState
                  title="No sales yet"
                  description="Your top products will appear after a completed sale."
                />
              )}
            </section>
          </div>
        )}
      </section>
      <div className="calm-page-status">
        <i className={syncState === "ready" ? "ready" : ""} />
        {syncState === "ready"
          ? "Your workspace is up to date"
          : syncState === "syncing"
            ? "Updating your workspace…"
            : "Check your connection to sync changes"}
      </div>
    </div>
  );
}
