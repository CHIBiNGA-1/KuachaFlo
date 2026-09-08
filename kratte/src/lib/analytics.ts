import type { Entity, Workspace } from "@/lib/types";
export type Period = "7" | "30" | "60";
const cents = (value: number) => Math.round(value * 100);
const localKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function dateRange(days: number, timeZone?: string, now = new Date()) {
  const count = Number.isFinite(days)
    ? Math.max(1, Math.min(366, Math.floor(days)))
    : 30;
  let end = new Date(now);
  if (timeZone) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const part = (type: string) =>
      parts.find((value) => value.type === type)!.value;
    end = new Date(`${part("year")}-${part("month")}-${part("day")}T12:00:00`);
  }
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - count + 1);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}
export function inRange(record: Entity, start: Date, end: Date) {
  return (
    !!record.date &&
    record.date >= localKey(start) &&
    record.date <= localKey(end)
  );
}
export function analytics(data: Workspace, days = 30) {
  days = Number.isFinite(days)
    ? Math.max(1, Math.min(366, Math.floor(days)))
    : 30;
  const { start, end } = dateRange(days, data.user.settings.timezone);
  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(start);
  previousStart.setDate(start.getDate() - days);
  const first = localKey(start),
    last = localKey(end),
    oldFirst = localKey(previousStart),
    oldLast = localKey(previousEnd);
  const orders: Entity[] = [],
    sales: Entity[] = [];
  const daily = new Map<string, number>(),
    previousDaily = new Map<string, number>();
  const sold = new Map<string, { units: number; minorRevenue: number }>();
  let revenueMinor = 0,
    previousRevenueMinor = 0,
    profitMinor = 0,
    previousProfitMinor = 0,
    retailMinor = 0,
    previousOrderCount = 0;
  // One pass over transactions; chart generation is O(days), not O(days × transactions).
  for (const order of data.records.sales) {
    const date = order.date || "";
    const current = date >= first && date <= last;
    const previous = date >= oldFirst && date <= oldLast;
    if (!current && !previous) continue;
    if (current) orders.push(order);
    if (previous) previousOrderCount++;
    if (order.status !== "Completed") continue;
    const amount = cents(order.amount || 0);
    const profit = (order.items || []).reduce(
      (sum, item) =>
        sum + (cents(item.price) - cents(item.cost)) * item.quantity,
      0,
    );
    if (current) {
      sales.push(order);
      revenueMinor += amount;
      profitMinor += profit;
      daily.set(date, (daily.get(date) || 0) + amount);
      if (order.channel === "Retail") retailMinor += amount;
      for (const item of order.items || []) {
        const old = sold.get(item.productId) || { units: 0, minorRevenue: 0 };
        sold.set(item.productId, {
          units: old.units + item.quantity,
          minorRevenue: old.minorRevenue + item.quantity * cents(item.price),
        });
      }
    } else {
      previousRevenueMinor += amount;
      previousProfitMinor += profit;
      previousDaily.set(date, (previousDaily.get(date) || 0) + amount);
    }
  }
  orders.sort(
    (a, b) =>
      (b.date || "").localeCompare(a.date || "") ||
      b.name.localeCompare(a.name),
  );
  const points = Array.from({ length: days }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    const oldDay = new Date(previousStart);
    oldDay.setDate(previousStart.getDate() + index);
    const label = localKey(day);
    return {
      date: day,
      label,
      current: (daily.get(label) || 0) / 100,
      previous: (previousDaily.get(localKey(oldDay)) || 0) / 100,
    };
  });
  const topProducts = data.records.inventory
    .map((product) => {
      const performance = sold.get(product.id);
      return {
        ...product,
        sold: {
          units: performance?.units || 0,
          revenue: (performance?.minorRevenue || 0) / 100,
        },
      };
    })
    .sort((a, b) => b.sold.revenue - a.sold.revenue);
  const expenses =
    data.records.expenses
      .filter((expense) => inRange(expense, start, end))
      .reduce((sum, expense) => sum + cents(expense.amount || 0), 0) / 100;
  const growth = (value: number, before: number) =>
    before ? ((value - before) / before) * 100 : value ? 100 : 0;
  return {
    start,
    end,
    sales,
    orders,
    revenue: revenueMinor / 100,
    previousRevenue: previousRevenueMinor / 100,
    profit: profitMinor / 100,
    lowStock: data.records.inventory.filter(
      (product) => (product.stock || 0) <= (product.reorderAt || 0),
    ),
    retail: retailMinor / 100,
    wholesale: (revenueMinor - retailMinor) / 100,
    points,
    topProducts,
    expenses,
    growth: growth(revenueMinor, previousRevenueMinor),
    orderGrowth: growth(orders.length, previousOrderCount),
    profitGrowth: growth(profitMinor, previousProfitMinor),
  };
}
