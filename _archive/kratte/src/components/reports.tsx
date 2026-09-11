"use client";
import { useState } from "react";
import {
  ArrowUpRight,
  Download,
  TrendingUp,
  CircleDollarSign,
  Receipt,
  Lightbulb,
  ArrowRight,
} from "lucide-react";
import { useShop } from "@/components/shop-provider";
import { Avatar, CardHeading, EmptyState, PageHeading } from "@/components/ui";
import { Growth, PeriodPicker, RevenueChart } from "@/components/overview";
import { analytics, type Period } from "@/lib/analytics";
import { exportCsv, money, type Entity, type Section } from "@/lib/types";
export function Reports({
  onNavigate,
}: {
  onNavigate: (section: Section, filter?: string) => void;
}) {
  const { data, notify } = useShop();
  const [period, setPeriod] = useState<Period>("30");
  if (!data) return null;
  const stats = analytics(data, Number(period));
  const currency = data.user.settings.currency;
  const net = stats.profit - stats.expenses;
  const margin = stats.revenue ? (stats.profit / stats.revenue) * 100 : 0;
  const expenseGroups = new Map<string, number>();
  for (const e of data.records.expenses) {
    const d = new Date(`${e.date}T12:00:00`);
    if (d >= stats.start && d <= stats.end)
      expenseGroups.set(
        e.category || "Other",
        (expenseGroups.get(e.category || "Other") || 0) + (e.amount || 0),
      );
  }
  const customerGroups = new Map<string, { revenue: number; orders: number }>();
  for (const s of stats.sales) {
    const name = s.customer || "Walk-in customer";
    const prev = customerGroups.get(name) || { revenue: 0, orders: 0 };
    customerGroups.set(name, {
      revenue: prev.revenue + (s.amount || 0),
      orders: prev.orders + 1,
    });
  }
  const customers = [...customerGroups]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5);
  const download = () => {
    const rows = [
      { name: "Revenue", amount: stats.revenue },
      { name: "Cost of goods sold", amount: stats.revenue - stats.profit },
      { name: "Gross profit", amount: stats.profit },
      { name: "Operating expenses", amount: stats.expenses },
      { name: "Net profit", amount: net },
      { name: "Completed orders", amount: stats.sales.length },
      ...[...expenseGroups].map(([name, amount]) => ({
        name: `Expense: ${name}`,
        amount,
      })),
    ].map((r, i) => ({
      ...r,
      id: String(i),
      resource: "expenses",
      date: new Date().toISOString().slice(0, 10),
      notes: `Last ${period} days · ${currency}`,
    })) as Entity[];
    exportCsv(rows, "financial-report");
    notify("Your financial report has been exported.");
  };
  return (
    <>
      <PageHeading
        title="Reports & insights"
        description="Understand your sales, costs, and profit."
        actions={
          <>
            <PeriodPicker value={period} onChange={setPeriod} />
            <button className="button button-primary" onClick={download}>
              <Download size={16} />
              Export report
            </button>
          </>
        }
      />
      <div className="report-metrics">
        {[
          {
            title: "Gross profit",
            value: money(stats.profit, currency),
            icon: TrendingUp,
            caption: "Revenue less cost of goods",
            growth: stats.profitGrowth,
          },
          {
            title: "Operating expenses",
            value: money(stats.expenses, currency),
            icon: Receipt,
            caption: "All expenses in this period",
          },
          {
            title: "Net profit",
            value: money(net, currency),
            icon: CircleDollarSign,
            caption: `${margin.toFixed(1)}% gross profit margin`,
          },
        ].map((metric) => (
          <div className="card report-metric" key={metric.title}>
            <div>
              <span>{metric.title}</span>
              <metric.icon size={19} />
            </div>
            <strong>{metric.value}</strong>
            <p>
              {metric.growth !== undefined && <Growth value={metric.growth} />}{" "}
              {metric.caption}
            </p>
          </div>
        ))}
      </div>
      <div className="overview-grid report-chart-row">
        <section className="card revenue-card">
          <CardHeading
            title="Revenue trend"
            subtitle="Revenue compared with the previous period."
            action={<span className="period-pill">Last {period} days</span>}
          />
          <div className="revenue-summary">
            <div>
              <strong>{money(stats.revenue, currency)}</strong>
              <Growth value={stats.growth} />
            </div>
            <div className="chart-legend">
              <span>
                <i className="legend-dot current" />
                Revenue
              </span>
              <span>
                <i className="legend-dash" />
                Previous
              </span>
            </div>
          </div>
          <RevenueChart points={stats.points} currency={currency} />
        </section>
        <section className="card profit-card">
          <CardHeading
            title="Profit & loss"
            subtitle="Revenue, costs, and net profit."
          />
          <div className="profit-lines">
            {[
              ["Total revenue", stats.revenue],
              ["Cost of goods sold", -(stats.revenue - stats.profit)],
              ["Gross profit", stats.profit],
              ["Operating expenses", -stats.expenses],
            ].map(([label, amount]) => (
              <div
                key={String(label)}
                className={label === "Gross profit" ? "subtotal" : ""}
              >
                <span>{label}</span>
                <strong>{money(Number(amount), currency)}</strong>
              </div>
            ))}
            <div className="net-profit">
              <span>Net profit</span>
              <strong>{money(net, currency)}</strong>
            </div>
          </div>
          <p className="profit-note">
            Based on completed sales and recorded expenses. Figures exclude
            unrecorded taxes.
          </p>
        </section>
      </div>
      <div className="overview-grid report-bottom">
        <section className="card">
          <CardHeading
            title="Your most valuable customers"
            subtitle="A good relationship is good for business."
            action={
              <button
                className="icon-button"
                onClick={() => onNavigate("customers")}
                aria-label="View customers"
              >
                <ArrowUpRight size={18} />
              </button>
            }
          />
          {customers.length ? (
            <div className="report-customer-list">
              {customers.map(([name, value], i) => (
                <div key={name}>
                  <span className="product-rank">{i + 1}</span>
                  <Avatar name={name} />
                  <span>
                    <strong>{name}</strong>
                    <small>{value.orders} completed orders</small>
                  </span>
                  <strong>{money(value.revenue, currency)}</strong>
                  <div className="customer-progress">
                    <i
                      style={{
                        width: `${(value.revenue / customers[0][1].revenue) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Relationships start with a sale"
              description="Your customer insights will appear here after your first sale."
            />
          )}
        </section>
        <section className="card">
          <CardHeading
            title="Where your money goes"
            subtitle="Operating expenses by category."
          />
          <div className="expense-breakdown">
            {[...expenseGroups]
              .sort((a, b) => b[1] - a[1])
              .map(([category, amount], i) => (
                <div key={category}>
                  <div>
                    <span>
                      <i
                        style={{
                          background: [
                            "#2b8565",
                            "#7dab8a",
                            "#b1cdb7",
                            "#cfbb89",
                            "#98acbb",
                            "#cab8d0",
                          ][i % 6],
                        }}
                      />
                      {category}
                    </span>
                    <strong>{money(amount, currency)}</strong>
                  </div>
                  <div className="expense-progress">
                    <i
                      style={{
                        width: `${(amount / Math.max(stats.expenses, 1)) * 100}%`,
                        background: [
                          "#2b8565",
                          "#7dab8a",
                          "#b1cdb7",
                          "#cfbb89",
                          "#98acbb",
                          "#cab8d0",
                        ][i % 6],
                      }}
                    />
                  </div>
                </div>
              ))}
            {!expenseGroups.size && (
              <EmptyState
                title="A clean expense sheet"
                description="Add expenses to see a breakdown here."
              />
            )}
          </div>
        </section>
      </div>
      <div className="insight-banner">
        <div className="insight-icon">
          <Lightbulb size={23} />
        </div>
        <div>
          <strong>A small action. A well-stocked tomorrow.</strong>
          <p>
            {stats.lowStock.length
              ? `${stats.lowStock.length} products are running low. Restocking now keeps your bestsellers ready for the next customer.`
              : "Your shelves are looking healthy. Keep an eye on your bestsellers as demand grows."}
          </p>
        </div>
        <button
          className="button"
          onClick={() =>
            onNavigate("inventory", stats.lowStock.length ? "Low stock" : "")
          }
        >
          Review inventory
          <ArrowRight size={16} />
        </button>
      </div>
    </>
  );
}
