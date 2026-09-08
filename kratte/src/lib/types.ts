export const resources = [
  "inventory",
  "sales",
  "customers",
  "suppliers",
  "purchases",
  "expenses",
  "team",
] as const;
export type Resource = (typeof resources)[number];
export type Section = Resource | "overview" | "reports" | "settings";
export type LineItem = {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  cost: number;
};
export type RecordData = {
  name: string;
  sku?: string;
  category?: string;
  stock?: number;
  reorderAt?: number;
  cost?: number;
  price?: number;
  image?: string;
  unit?: string;
  supplier?: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  balance?: number;
  customer?: string;
  amount?: number;
  status?: string;
  channel?: string;
  payment?: string;
  date?: string;
  dueDate?: string;
  notes?: string;
  role?: string;
  items?: LineItem[];
  pinned?: boolean;
  expectedStock?: number;
  expectedVersion?: number;
};
export type Entity = RecordData & {
  id: string;
  resource: Resource;
  version?: number;
};
export type MutationResult = { record: Entity | null; inventory: Entity[] };
export type StoreSettings = {
  currency: string;
  timezone: string;
  lowStockAlerts: boolean;
  orderNotifications: boolean;
  weeklyDigest: boolean;
  plan: string;
  trialEnds?: string;
  dismissedNotifications?: string[];
  inventoryView?: "board" | "table";
  inventoryDensity?: "comfortable" | "compact";
  showDashboardInsights?: boolean;
  showInventorySummary?: boolean;
};
export type Profile = {
  id: string;
  email: string;
  name: string;
  storeName: string;
  isDemo: boolean;
  settings: StoreSettings;
};
export type Workspace = { user: Profile; records: Record<Resource, Entity[]> };
export type Field = {
  key: keyof RecordData;
  label: string;
  type?: "text" | "number" | "email" | "date" | "select" | "textarea";
  options?: string[];
  required?: boolean;
  placeholder?: string;
  full?: boolean;
  min?: number;
  defaultValue?: string | number;
};
export type ResourceConfig = {
  title: string;
  singular: string;
  description: string;
  fields: Field[];
  tabs: string[];
};
export const configs: Record<Resource, ResourceConfig> = {
  inventory: {
    title: "Inventory",
    singular: "product",
    description: "Manage products and stock levels.",
    tabs: ["All products", "In stock", "Low stock", "Out of stock"],
    fields: [
      {
        key: "name",
        label: "Product name",
        required: true,
        full: true,
        placeholder: "e.g. Arabica Coffee Beans",
      },
      { key: "sku", label: "SKU", required: true, placeholder: "SW-1013" },
      {
        key: "category",
        label: "Category",
        type: "select",
        options: [
          "Beverages",
          "Pantry",
          "Fresh & dairy",
          "Snacks",
          "Personal care",
          "Household",
          "Other",
        ],
        required: true,
      },
      {
        key: "price",
        label: "Selling price",
        type: "number",
        required: true,
        min: 0,
      },
      {
        key: "cost",
        label: "Cost price",
        type: "number",
        required: true,
        min: 0,
      },
      {
        key: "stock",
        label: "Stock on hand",
        type: "number",
        required: true,
        defaultValue: 0,
        min: 0,
      },
      {
        key: "reorderAt",
        label: "Low-stock threshold",
        type: "number",
        defaultValue: 20,
        min: 0,
      },
      { key: "unit", label: "Size / unit", placeholder: "250 g" },
      { key: "supplier", label: "Supplier", placeholder: "Supplier name" },
      {
        key: "image",
        label: "Product image URL",
        type: "text",
        full: true,
        placeholder: "https://… (optional)",
      },
      { key: "notes", label: "Notes", type: "textarea", full: true },
    ],
  },
  sales: {
    title: "Sales & orders",
    singular: "sale",
    description: "Track customer orders and payments.",
    tabs: ["All orders", "Completed", "Pending", "Cancelled"],
    fields: [],
  },
  customers: {
    title: "Customers",
    singular: "customer",
    description: "Your customers and business accounts.",
    tabs: ["All customers", "Retail", "Wholesale"],
    fields: [
      { key: "name", label: "Full name", required: true },
      { key: "company", label: "Business name", placeholder: "Optional" },
      { key: "email", label: "Email address", type: "email", required: true },
      { key: "phone", label: "Phone number", placeholder: "+1 (555) 000-0000" },
      {
        key: "channel",
        label: "Customer type",
        type: "select",
        options: ["Retail", "Wholesale"],
        required: true,
      },
      {
        key: "balance",
        label: "Opening balance",
        type: "number",
        min: 0,
        defaultValue: 0,
      },
      { key: "address", label: "Address", full: true },
      { key: "notes", label: "Notes", type: "textarea", full: true },
    ],
  },
  suppliers: {
    title: "Suppliers",
    singular: "supplier",
    description: "Your suppliers and contact details.",
    tabs: ["All suppliers", "Active", "Inactive"],
    fields: [
      { key: "name", label: "Supplier name", required: true },
      { key: "company", label: "Contact person", required: true },
      { key: "email", label: "Email address", type: "email", required: true },
      { key: "phone", label: "Phone number" },
      {
        key: "category",
        label: "Product category",
        type: "select",
        options: [
          "Beverages",
          "Pantry",
          "Fresh & dairy",
          "Snacks",
          "Personal care",
          "Household",
          "Multiple categories",
        ],
      },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: ["Active", "Inactive"],
      },
      { key: "address", label: "Business address", full: true },
      {
        key: "notes",
        label: "Notes & payment terms",
        type: "textarea",
        full: true,
      },
    ],
  },
  purchases: {
    title: "Purchase orders",
    singular: "purchase order",
    description: "Plan restocks and receive deliveries.",
    tabs: ["All purchases", "Ordered", "Received", "Cancelled"],
    fields: [],
  },
  expenses: {
    title: "Expenses",
    singular: "expense",
    description: "Track what your store spends.",
    tabs: ["All expenses", "Paid", "Unpaid"],
    fields: [
      {
        key: "name",
        label: "Description",
        required: true,
        full: true,
        placeholder: "e.g. Monthly store rent",
      },
      {
        key: "amount",
        label: "Amount",
        type: "number",
        required: true,
        min: 0.01,
      },
      {
        key: "category",
        label: "Category",
        type: "select",
        options: [
          "Rent",
          "Utilities",
          "Payroll",
          "Marketing",
          "Shipping",
          "Supplies",
          "Other",
        ],
        required: true,
      },
      { key: "date", label: "Date", type: "date", required: true },
      {
        key: "payment",
        label: "Payment method",
        type: "select",
        options: ["Bank transfer", "Credit card", "Cash"],
      },
      {
        key: "status",
        label: "Payment status",
        type: "select",
        options: ["Paid", "Unpaid"],
      },
      { key: "notes", label: "Notes", type: "textarea", full: true },
    ],
  },
  team: {
    title: "Team members",
    singular: "team member",
    description: "Your staff directory.",
    tabs: ["All members", "Active", "Invited"],
    fields: [
      { key: "name", label: "Full name", required: true },
      { key: "email", label: "Email address", type: "email", required: true },
      {
        key: "role",
        label: "Role",
        type: "select",
        options: [
          "Manager",
          "Sales associate",
          "Inventory manager",
          "Accountant",
        ],
        required: true,
      },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: ["Active", "Invited", "Inactive"],
      },
      { key: "phone", label: "Phone number" },
      { key: "notes", label: "Notes", type: "textarea", full: true },
    ],
  },
};
export const emptyRecords = (): Record<Resource, Entity[]> => ({
  inventory: [],
  sales: [],
  customers: [],
  suppliers: [],
  purchases: [],
  expenses: [],
  team: [],
});
export function money(value: number, currency = "USD", decimals = 2) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(value);
}
export function number(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}
export function initials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}
export function dateLabel(value?: string) {
  if (!value) return "—";
  return new Date(
    value + (value.length === 10 ? "T12:00:00" : ""),
  ).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
export function exportCsv(rows: Entity[], name: string) {
  if (!rows.length) return;
  const keys = Array.from(
    new Set(rows.flatMap((row) => Object.keys(row))),
  ).filter((key) => !["resource", "image", "items"].includes(key));
  const escape = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const content = [
    keys.map(escape).join(","),
    ...rows.map((row) =>
      keys.map((key) => escape(row[key as keyof Entity])).join(","),
    ),
  ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `shopwise-${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
