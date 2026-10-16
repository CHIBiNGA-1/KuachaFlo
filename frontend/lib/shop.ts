import { ShopError, readList, readThrough, request, writeThrough } from "./offline/engine";
import { cacheGet, cacheSet } from "./offline/db";

export { ShopError };

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

// Seven on purpose: few enough to glance at, broad enough for a small shop.
// "Personal care & household" is one shelf in most corner shops; Gadgets
// (chargers, earphones, phone accessories) earned its own slot.
export const SHOP_CATEGORIES = [
  "Beverages",
  "Pantry",
  "Fresh & dairy",
  "Snacks",
  "Personal care & household",
  "Gadgets",
  "Other",
];

export const CATEGORY_TINTS: Record<string, string> = {
  Beverages: "#8197ab",
  Pantry: "#c6a566",
  "Fresh & dairy": "#7ab3a8",
  Snacks: "#c98f6b",
  "Personal care & household": "#ae8c98",
  Gadgets: "#7d86b8",
  Other: "#a8a29e",
};

// Rows saved before the list changed carry the old names until the SQL
// migration runs; map them so nothing renders as an orphaned value.
const LEGACY_CATEGORY: Record<string, string> = {
  "Personal care": "Personal care & household",
  Household: "Personal care & household",
};

export function normalizeCategory(category: string): string {
  return LEGACY_CATEGORY[category] || category;
}

export function stockState(p: Product): "out" | "low" | "in" {
  if ((p.stock || 0) === 0) return "out";
  if ((p.stock || 0) <= (p.reorder_at || 0)) return "low";
  return "in";
}

export function tintFor(category: string): string {
  return CATEGORY_TINTS[normalizeCategory(category)] || CATEGORY_TINTS.Other;
}

// ── local cache helpers (offline-first) ─────────────────────────────────
// Every list lives in IndexedDB under a key; these keep the optimistic
// view of it consistent while writes are queued. Real data always wins
// the next time readThrough succeeds.

type Row = { id: string };

async function listGet<T extends Row>(key: string): Promise<T[]> {
  return (await cacheGet<T[]>(key)) || [];
}
async function listUpsert<T extends Row>(key: string, item: T): Promise<void> {
  const list = await listGet<T>(key);
  const i = list.findIndex((r) => r.id === item.id);
  if (i >= 0) list[i] = item;
  else list.unshift(item);
  await cacheSet(key, list);
}
async function listPatch<T extends Row>(key: string, id: string, patch: Partial<T>): Promise<T | undefined> {
  const list = await listGet<T>(key);
  const i = list.findIndex((r) => r.id === id);
  if (i < 0) return undefined;
  list[i] = { ...list[i], ...patch };
  await cacheSet(key, list);
  return list[i];
}
async function listRemove(key: string, id: string): Promise<void> {
  await cacheSet(key, (await listGet<Row>(key)).filter((r) => r.id !== id));
}
async function listSwap<T extends Row>(key: string, localId: string, real: T): Promise<void> {
  const list = await listGet<T>(key);
  const i = list.findIndex((r) => r.id === localId);
  if (i >= 0) list[i] = real;
  else list.unshift(real);
  await cacheSet(key, list);
}

const newKey = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

function patchFromInput(input: Record<string, unknown>): Record<string, unknown> {
  const { expected_version: _v, expected_stock: _s, ...rest } = input;
  return rest;
}

// ── overview / products ─────────────────────────────────────────────────

export async function getOverview(): Promise<Overview> {
  return readThrough<Overview>("overview", "/api/v1/shop/overview", "Couldn't load the overview.");
}

export async function listProducts(): Promise<Product[]> {
  const items = await readList<Product>("products", "/api/v1/shop/products?limit=200", "Couldn't load inventory.");
  return items.map((p) => ({ ...p, category: normalizeCategory(p.category) }));
}

export async function createProduct(input: Record<string, unknown>): Promise<Product> {
  const key = newKey();
  const localId = `local:${key}`;
  return writeThrough<Product>({
    path: "/api/v1/shop/products",
    method: "POST",
    body: input,
    idempotencyKey: key,
    cacheKey: "products",
    localId,
    optimistic: () => ({
      id: localId,
      name: String(input.name ?? ""),
      sku: String(input.sku ?? ""),
      category: String(input.category ?? "Other"),
      price: Number(input.price ?? 0),
      cost: Number(input.cost ?? 0),
      stock: Number(input.stock ?? 0),
      reorder_at: Number(input.reorder_at ?? 0),
      unit: (input.unit as string) ?? null,
      supplier_id: (input.supplier_id as string) ?? null,
      image: String(input.image ?? ""),
      notes: String(input.notes ?? ""),
      pinned: Boolean(input.pinned),
      archived: false,
      version: 1,
      created_at: nowIso(),
    }),
    applyToCache: (p) => listUpsert("products", p),
    reconcile: (real) => listSwap("products", localId, real),
  });
}

export async function suggestCategory(name: string): Promise<string | null> {
  try {
    const body = await request<{ category: string | null }>(
      `/api/v1/shop/products/suggest-category?name=${encodeURIComponent(name)}`
    );
    return body.category;
  } catch {
    // Offline or failed: the form just keeps its default. A purely
    // local fallback would need the product history on-device; the
    // suggestion is a convenience, never worth blocking or erroring.
    return null;
  }
}

export async function updateProduct(id: string, input: Record<string, unknown>): Promise<Product> {
  return writeThrough<Product>({
    path: `/api/v1/shop/products/${id}`,
    method: "PATCH",
    body: input,
    cacheKey: "products",
    optimistic: () => ({ id, ...patchFromInput(input) } as unknown as Product),
    applyToCache: async (p) => {
      // Offline, `p` is only the patch (+id); online it is the full row.
      const merged = await listPatch<Product>("products", id, p);
      if (!merged) await listUpsert("products", p);
    },
  }).then(async (p) => (await listGet<Product>("products")).find((r) => r.id === id) || p);
}

export async function deleteProduct(id: string): Promise<void> {
  await writeThrough<void>({
    path: `/api/v1/shop/products/${id}`,
    method: "DELETE",
    cacheKey: "products",
    optimistic: () => undefined as void,
    applyToCache: () => listRemove("products", id),
  });
  await listRemove("products", id);
}

export async function archiveProduct(id: string, archived: boolean): Promise<Product> {
  return writeThrough<Product>({
    path: `/api/v1/shop/products/${id}/${archived ? "archive" : "unarchive"}`,
    method: "POST",
    cacheKey: "products",
    optimistic: () => ({ id, archived } as unknown as Product),
    applyToCache: async (p) => {
      const merged = await listPatch<Product>("products", id, p);
      if (!merged) await listUpsert("products", p);
    },
  });
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
  return readList<Order>(
    `orders:${kind}`,
    `/api/v1/shop/${ORDER_PATH[kind]}?limit=200`,
    kind === "sale" ? "Couldn't load sales." : "Couldn't load purchases."
  );
}

// Offline sale/purchase: move cached stock the same way the server will
// (completed sale takes stock out, received purchase puts it in) so the
// shelf the owner sees stays believable until the real numbers return.
async function applyStockLocally(kind: OrderKind, status: string, items: { product_id: string; quantity: number }[]) {
  const moves = (kind === "sale" && status === "Completed") || (kind === "purchase" && status === "Received");
  if (!moves) return;
  const sign = kind === "sale" ? -1 : 1;
  const list = await listGet<Product>("products");
  for (const line of items) {
    const p = list.find((x) => x.id === line.product_id);
    if (p) p.stock = Math.max(0, (p.stock || 0) + sign * Number(line.quantity || 0));
  }
  await cacheSet("products", list);
}

export async function createOrder(kind: OrderKind, input: Record<string, unknown>): Promise<Order> {
  const key = newKey();
  const localId = `local:${key}`;
  const cacheKey = `orders:${kind}`;
  return writeThrough<Order>({
    path: `/api/v1/shop/${ORDER_PATH[kind]}`,
    method: "POST",
    body: input,
    idempotencyKey: key,
    cacheKey,
    localId,
    optimistic: () => {
      const lines = ((input.items as { product_id: string; quantity: number }[]) || []).map((l) => ({
        product_id: l.product_id,
        quantity: Number(l.quantity || 0),
      }));
      return {
        id: localId,
        kind,
        reference: "Syncing…",
        party_name: String((kind === "sale" ? input.customer : input.supplier) || (kind === "sale" ? "Walk-in customer" : "")),
        party_id: null,
        status: String(input.status ?? OPEN_STATUS[kind]),
        channel: String(input.channel ?? "Retail"),
        payment: String(input.payment ?? "Paid"),
        occurred_on: String(input.date ?? nowIso().slice(0, 10)),
        due_on: null,
        notes: String(input.notes ?? ""),
        items: lines.map((l) => ({ ...l, name: "", price: 0, cost: 0 })),
        amount_total: 0,
        version: 1,
        created_at: nowIso(),
      } as Order;
    },
    applyToCache: async (o) => {
      await listUpsert(cacheKey, o);
      if (o.id.startsWith("local:")) {
        await applyStockLocally(kind, o.status, (input.items as { product_id: string; quantity: number }[]) || []);
      }
    },
    reconcile: (real) => listSwap(cacheKey, localId, real),
  });
}

export async function updateOrder(
  kind: OrderKind,
  id: string,
  input: Record<string, unknown>
): Promise<Order> {
  const cacheKey = `orders:${kind}`;
  return writeThrough<Order>({
    path: `/api/v1/shop/${ORDER_PATH[kind]}/${id}`,
    method: "PATCH",
    body: input,
    cacheKey,
    optimistic: () => ({ id, status: input.status } as unknown as Order),
    applyToCache: async (o) => {
      const merged = await listPatch<Order>(cacheKey, id, o);
      if (!merged) await listUpsert(cacheKey, o);
    },
  });
}

export async function cancelOrder(kind: OrderKind, id: string): Promise<Order> {
  const cacheKey = `orders:${kind}`;
  return writeThrough<Order>({
    path: `/api/v1/shop/${ORDER_PATH[kind]}/${id}/cancel`,
    method: "POST",
    cacheKey,
    optimistic: () => ({ id, status: "Cancelled" } as unknown as Order),
    applyToCache: async (o) => {
      const merged = await listPatch<Order>(cacheKey, id, o);
      if (!merged) await listUpsert(cacheKey, o);
    },
  });
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

async function listParty<T extends Row>(kind: PartyKind, label: string): Promise<T[]> {
  return readList<T>(kind, `/api/v1/shop/${kind}`, label);
}

export const listCustomers = () => listParty<Customer>("customers", "Couldn't load customers.");
export const listSuppliers = () => listParty<Supplier>("suppliers", "Couldn't load suppliers.");
export const listTeam = () => listParty<TeamMember>("team", "Couldn't load the team.");

export async function createParty(kind: PartyKind, input: Record<string, unknown>): Promise<Person> {
  const key = newKey();
  const localId = `local:${key}`;
  return writeThrough<Person>({
    path: `/api/v1/shop/${kind}`,
    method: "POST",
    body: input,
    idempotencyKey: key,
    cacheKey: kind,
    localId,
    optimistic: () => ({ id: localId, name: "", ...input } as unknown as Person),
    applyToCache: (p) => listUpsert(kind, p),
    reconcile: (real) => listSwap(kind, localId, real),
  });
}

export async function updateParty(
  kind: PartyKind,
  id: string,
  input: Record<string, unknown>
): Promise<Person> {
  return writeThrough<Person>({
    path: `/api/v1/shop/${kind}/${id}`,
    method: "PATCH",
    body: input,
    cacheKey: kind,
    optimistic: () => ({ id, ...patchFromInput(input) } as unknown as Person),
    applyToCache: async (p) => {
      const merged = await listPatch<Person>(kind, id, p);
      if (!merged) await listUpsert(kind, p);
    },
  });
}

export async function deleteParty(kind: PartyKind, id: string): Promise<void> {
  await writeThrough<void>({
    path: `/api/v1/shop/${kind}/${id}`,
    method: "DELETE",
    cacheKey: kind,
    optimistic: () => undefined as void,
    applyToCache: () => listRemove(kind, id),
  });
  await listRemove(kind, id);
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
  return readList<ShopExpense>("expenses", "/api/v1/shop/expenses?limit=200", "Couldn't load expenses.");
}

export async function createExpense(input: Record<string, unknown>): Promise<ShopExpense> {
  const key = newKey();
  const localId = `local:${key}`;
  return writeThrough<ShopExpense>({
    path: "/api/v1/shop/expenses",
    method: "POST",
    body: input,
    idempotencyKey: key,
    cacheKey: "expenses",
    localId,
    optimistic: () => ({
      id: localId,
      name: String(input.name ?? ""),
      amount: Number(input.amount ?? 0),
      category: String(input.category ?? "Other"),
      date: (input.date as string) ?? nowIso().slice(0, 10),
      method: String(input.method ?? "Cash"),
      paid: String(input.paid ?? "Paid"),
      notes: String(input.notes ?? ""),
    }),
    applyToCache: (e) => listUpsert("expenses", e),
    reconcile: (real) => listSwap("expenses", localId, real),
  });
}

export async function updateExpense(id: string, input: Record<string, unknown>): Promise<ShopExpense> {
  return writeThrough<ShopExpense>({
    path: `/api/v1/shop/expenses/${id}`,
    method: "PATCH",
    body: input,
    cacheKey: "expenses",
    optimistic: () => ({ id, ...patchFromInput(input) } as unknown as ShopExpense),
    applyToCache: async (e) => {
      const merged = await listPatch<ShopExpense>("expenses", id, e);
      if (!merged) await listUpsert("expenses", e);
    },
  });
}

export async function deleteExpense(id: string): Promise<void> {
  await writeThrough<void>({
    path: `/api/v1/shop/expenses/${id}`,
    method: "DELETE",
    cacheKey: "expenses",
    optimistic: () => undefined as void,
    applyToCache: () => listRemove("expenses", id),
  });
  await listRemove("expenses", id);
}

export type ShopBusiness = { id: string; name: string; currency: string };

export async function getBusiness(): Promise<ShopBusiness> {
  return readThrough<ShopBusiness>("business", "/api/v1/shop/business", "Couldn't load shop settings.");
}

export async function updateBusiness(name: string): Promise<ShopBusiness> {
  return writeThrough<ShopBusiness>({
    path: "/api/v1/shop/business",
    method: "PATCH",
    body: { name },
    cacheKey: "business",
    optimistic: () => ({ id: "", name, currency: "" }),
    applyToCache: async (b) => {
      const current = await cacheGet<ShopBusiness>("business");
      await cacheSet("business", { ...(current || { id: "", currency: "" }), ...b, name });
    },
  });
}
