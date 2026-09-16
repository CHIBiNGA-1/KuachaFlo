import { supabase } from "./supabase";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

export class ShopError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  reorder_at: number;
  unit: string | null;
  supplier_id: string | null;
  image: string;
  notes: string;
  pinned: boolean;
  archived: boolean;
  version: number;
  created_at: string | null;
};

export type Overview = {
  low_stock: Product[];
  out_of_stock_count: number;
  today_sales: number;
  week_sales: number;
  pending_orders: number;
  top_products: { name: string; quantity: number }[];
};

export const SHOP_CATEGORIES = [
  "Beverages",
  "Pantry",
  "Fresh & dairy",
  "Snacks",
  "Personal care",
  "Household",
  "Other",
];

export const CATEGORY_TINTS: Record<string, string> = {
  Beverages: "#8197ab",
  Pantry: "#c6a566",
  "Fresh & dairy": "#7ab3a8",
  Snacks: "#c98f6b",
  "Personal care": "#ae8c98",
  Household: "#9eb39e",
  Other: "#a8a29e",
};

export function stockState(p: Product): "out" | "low" | "in" {
  if ((p.stock || 0) === 0) return "out";
  if ((p.stock || 0) <= (p.reorder_at || 0)) return "low";
  return "in";
}

export function tintFor(category: string): string {
  return CATEGORY_TINTS[category] || CATEGORY_TINTS.Other;
}

async function shop(path: string, init?: RequestInit): Promise<Response> {
  if (!API_BASE) {
    throw new ShopError(0, "NOT_CONNECTED", "Couldn't reach the shop — the reader isn't connected yet.");
  }
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;
  if (!token) throw new ShopError(401, "SIGNED_OUT", "Sign in first.");
  try {
    return await fetch(API_BASE + path, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
    });
  } catch {
    throw new ShopError(0, "UNREACHABLE", "Couldn't reach the shop — check your connection and try again.");
  }
}

async function send<T>(res: Response, fallback: string): Promise<T> {
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    let message = fallback;
    let code = "REQUEST_FAILED";
    try {
      const body = await res.json();
      if (typeof body?.error === "string" && body.error) message = body.error;
      else if (typeof body?.detail === "string" && body.detail) message = body.detail;
      if (typeof body?.code === "string" && body.code) code = body.code;
    } catch {
      /* keep the fallback */
    }
    throw new ShopError(res.status, code, message);
  }
  return (await res.json()) as T;
}

export async function getOverview(): Promise<Overview> {
  return send(await shop("/api/v1/shop/overview"), "Couldn't load the overview.");
}

export async function listProducts(): Promise<Product[]> {
  const body = await send<{ items: Product[] }>(
    await shop("/api/v1/shop/products?limit=200"),
    "Couldn't load inventory."
  );
  return body.items;
}

export async function createProduct(input: Record<string, unknown>): Promise<Product> {
  return send(
    await shop("/api/v1/shop/products", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(input),
    }),
    "Couldn't add that product."
  );
}

export async function updateProduct(id: string, input: Record<string, unknown>): Promise<Product> {
  return send(
    await shop(`/api/v1/shop/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Couldn't save those changes."
  );
}

export async function deleteProduct(id: string): Promise<void> {
  await send(await shop(`/api/v1/shop/products/${id}`, { method: "DELETE" }), "Couldn't delete that product.");
}

export async function archiveProduct(id: string, archived: boolean): Promise<Product> {
  return send(
    await shop(`/api/v1/shop/products/${id}/${archived ? "archive" : "unarchive"}`, { method: "POST" }),
    "Couldn't change that product."
  );
}

export type OrderKind = "sale" | "purchase";

export type OrderItem = {
  product_id: string;
  name: string;
  quantity: number;
  price: number;
  cost: number;
};

export type Order = {
  id: string;
  kind: OrderKind;
  reference: string;
  party_name: string;
  party_id: string | null;
  status: string;
  channel: string;
  payment: string;
  occurred_on: string | null;
  due_on: string | null;
  notes: string;
  items: OrderItem[];
  amount_total: number;
  version: number;
  created_at: string | null;
};

export const ORDER_STATUSES: Record<OrderKind, string[]> = {
  sale: ["Completed", "Pending", "Cancelled"],
  purchase: ["Ordered", "Received", "Cancelled"],
};

export const OPEN_STATUS: Record<OrderKind, string> = { sale: "Pending", purchase: "Ordered" };
export const DONE_STATUS: Record<OrderKind, string> = { sale: "Completed", purchase: "Received" };

export const SHOP_CHANNELS = ["Retail", "Wholesale"];
export const SHOP_PAYMENTS = ["Paid", "Unpaid"];

const ORDER_PATH: Record<OrderKind, string> = { sale: "sales", purchase: "purchases" };

export async function listOrders(kind: OrderKind): Promise<Order[]> {
  const body = await send<{ items: Order[] }>(
    await shop(`/api/v1/shop/${ORDER_PATH[kind]}?limit=200`),
    kind === "sale" ? "Couldn't load sales." : "Couldn't load purchases."
  );
  return body.items;
}

export async function createOrder(kind: OrderKind, input: Record<string, unknown>): Promise<Order> {
  return send(
    await shop(`/api/v1/shop/${ORDER_PATH[kind]}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(input),
    }),
    kind === "sale" ? "Couldn't ring up that sale." : "Couldn't place that order."
  );
}

export async function updateOrder(
  kind: OrderKind,
  id: string,
  input: Record<string, unknown>
): Promise<Order> {
  return send(
    await shop(`/api/v1/shop/${ORDER_PATH[kind]}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Couldn't save those changes."
  );
}

export async function cancelOrder(kind: OrderKind, id: string): Promise<Order> {
  return send(
    await shop(`/api/v1/shop/${ORDER_PATH[kind]}/${id}/cancel`, { method: "POST" }),
    "Couldn't cancel that order."
  );
}

export type PartyKind = "customers" | "suppliers" | "team";

export type Customer = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  channel: string;
  balance: number;
  address: string;
  notes: string;
};

export type Supplier = {
  id: string;
  name: string;
  contact_person: string;
  company: string;
  email: string;
  phone: string;
  category: string;
  status: string;
  address: string;
  notes: string;
};

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  phone: string;
  notes: string;
};

export type Person = Customer | Supplier | TeamMember;

export const CUSTOMER_TYPES = ["Retail", "Wholesale"];
export const SUPPLIER_CATEGORIES = [...SHOP_CATEGORIES, "Multiple categories"];
export const TEAM_ROLES = ["Manager", "Sales associate", "Inventory manager", "Accountant"];
export const PARTY_STATUSES = ["Active", "Inactive"];
export const TEAM_STATUSES = ["Active", "Invited", "Inactive"];

const PERSON_TINTS = ["#8197ab", "#c6a566", "#7ab3a8", "#c98f6b", "#ae8c98", "#9eb39e"];

export function tintForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PERSON_TINTS[h % PERSON_TINTS.length];
}

const PARTY_LOAD_ERROR: Record<PartyKind, string> = {
  customers: "Couldn't load customers.",
  suppliers: "Couldn't load suppliers.",
  team: "Couldn't load the team.",
};

export async function listCustomers(): Promise<Customer[]> {
  const body = await send<{ items: Customer[] }>(
    await shop("/api/v1/shop/customers"),
    PARTY_LOAD_ERROR.customers
  );
  return body.items;
}

export async function listSuppliers(): Promise<Supplier[]> {
  const body = await send<{ items: Supplier[] }>(
    await shop("/api/v1/shop/suppliers"),
    PARTY_LOAD_ERROR.suppliers
  );
  return body.items;
}

export async function listTeam(): Promise<TeamMember[]> {
  const body = await send<{ items: TeamMember[] }>(
    await shop("/api/v1/shop/team"),
    PARTY_LOAD_ERROR.team
  );
  return body.items;
}

export async function createParty(kind: PartyKind, input: Record<string, unknown>): Promise<Person> {
  return send(
    await shop(`/api/v1/shop/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Couldn't add them — try again."
  );
}

export async function updateParty(
  kind: PartyKind,
  id: string,
  input: Record<string, unknown>
): Promise<Person> {
  return send(
    await shop(`/api/v1/shop/${kind}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Couldn't save those changes."
  );
}

export async function deleteParty(kind: PartyKind, id: string): Promise<void> {
  await send(
    await shop(`/api/v1/shop/${kind}/${id}`, { method: "DELETE" }),
    "Couldn't remove them — try again."
  );
}

export type ShopExpense = {
  id: string;
  name: string;
  amount: number;
  category: string;
  date: string | null;
  method: string;
  paid: string;
  notes: string;
};

export const SHOP_EXPENSE_CATEGORIES = [
  "Rent",
  "Utilities",
  "Payroll",
  "Marketing",
  "Supplies",
  "Shipping",
  "Transport",
  "Other",
];

export const SHOP_PAYMENT_METHODS = ["Cash", "Mobile money", "Bank transfer", "Card", "Other"];

export async function listExpenses(): Promise<ShopExpense[]> {
  const body = await send<{ items: ShopExpense[] }>(
    await shop("/api/v1/shop/expenses?limit=200"),
    "Couldn't load expenses."
  );
  return body.items;
}

export async function createExpense(input: Record<string, unknown>): Promise<ShopExpense> {
  return send(
    await shop("/api/v1/shop/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(input),
    }),
    "Couldn't log that expense."
  );
}

export async function updateExpense(id: string, input: Record<string, unknown>): Promise<ShopExpense> {
  return send(
    await shop(`/api/v1/shop/expenses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Couldn't save those changes."
  );
}

export async function deleteExpense(id: string): Promise<void> {
  await send(
    await shop(`/api/v1/shop/expenses/${id}`, { method: "DELETE" }),
    "Couldn't remove that expense."
  );
}

export type ShopBusiness = { id: string; name: string; currency: string };

export async function getBusiness(): Promise<ShopBusiness> {
  return send(await shop("/api/v1/shop/business"), "Couldn't load shop settings.");
}

export async function updateBusiness(name: string): Promise<ShopBusiness> {
  return send(
    await shop("/api/v1/shop/business", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
    "Couldn't rename the shop."
  );
}