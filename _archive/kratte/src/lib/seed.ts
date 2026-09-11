import { randomUUID } from "node:crypto";
import { db, type Transaction } from "@/db";
import { records } from "@/db/schema";
import { productArt } from "@/lib/product-art";
import type { RecordData, Resource, LineItem } from "@/lib/types";

export async function seedWorkspace(
  userId: string,
  executor: Transaction | typeof db = db,
) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const date = (daysAgo: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().slice(0, 10);
  };
  const productData: RecordData[] = [
    {
      name: "Arabica Coffee Beans",
      sku: "SW-1001",
      category: "Beverages",
      price: 18.5,
      cost: 9.2,
      stock: 248,
      reorderAt: 30,
      unit: "250 g",
      image: "catalog:0",
      supplier: "Harvest & Co.",
    },
    {
      name: "Extra Virgin Olive Oil",
      sku: "SW-1002",
      category: "Pantry",
      price: 24.0,
      cost: 13.0,
      stock: 8,
      reorderAt: 20,
      unit: "500 ml",
      image: "catalog:1",
      supplier: "Mediterranean Goods",
    },
    {
      name: "Organic Rolled Oats",
      sku: "SW-1003",
      category: "Pantry",
      price: 8.5,
      cost: 4.0,
      stock: 186,
      reorderAt: 25,
      unit: "1 kg",
      image: "catalog:2",
      supplier: "Harvest & Co.",
    },
    {
      name: "Pure Wildflower Honey",
      sku: "SW-1004",
      category: "Pantry",
      price: 14.0,
      cost: 7.2,
      stock: 64,
      reorderAt: 15,
      unit: "350 g",
      image: "catalog:3",
      supplier: "Meadow Naturals",
    },
    {
      name: "Matcha Green Tea",
      sku: "SW-1005",
      category: "Beverages",
      price: 16.0,
      cost: 8.5,
      stock: 12,
      reorderAt: 15,
      unit: "100 g",
      image: "catalog:4",
      supplier: "Harvest & Co.",
    },
    {
      name: "Wholegrain Pasta",
      sku: "SW-1006",
      category: "Pantry",
      price: 6.5,
      cost: 3.0,
      stock: 156,
      reorderAt: 24,
      unit: "500 g",
      image: "catalog:5",
      supplier: "Mediterranean Goods",
    },
    {
      name: "Unsweetened Almond Milk",
      sku: "SW-1007",
      category: "Fresh & dairy",
      price: 4.5,
      cost: 2.1,
      stock: 7,
      reorderAt: 24,
      unit: "1 L",
      supplier: "Freshway Distributors",
    },
    {
      name: "Dark Chocolate 70%",
      sku: "SW-1008",
      category: "Snacks",
      price: 7.0,
      cost: 3.5,
      stock: 94,
      reorderAt: 20,
      unit: "100 g",
      supplier: "Meadow Naturals",
    },
    {
      name: "Himalayan Pink Salt",
      sku: "SW-1009",
      category: "Pantry",
      price: 5.0,
      cost: 2.2,
      stock: 112,
      reorderAt: 20,
      unit: "250 g",
      supplier: "Mediterranean Goods",
    },
    {
      name: "Premium Basmati Rice",
      sku: "SW-1010",
      category: "Pantry",
      price: 12.0,
      cost: 6.4,
      stock: 320,
      reorderAt: 50,
      unit: "2 kg",
      supplier: "Harvest & Co.",
    },
    {
      name: "Organic Coconut Oil",
      sku: "SW-1011",
      category: "Pantry",
      price: 15.0,
      cost: 8.0,
      stock: 0,
      reorderAt: 12,
      unit: "500 ml",
      supplier: "Meadow Naturals",
    },
    {
      name: "Handmade Oat Soap",
      sku: "SW-1012",
      category: "Personal care",
      price: 8.0,
      cost: 3.6,
      stock: 76,
      reorderAt: 15,
      unit: "120 g",
      supplier: "Good Earth Essentials",
    },
  ];
  const products = productData.map((data) => ({
    id: randomUUID(),
    userId,
    resource: "inventory",
    data: { ...data, image: data.image || productArt(data).src },
  }));
  const customers: RecordData[] = [
    {
      name: "Olivia Rhye",
      company: "Cornerstone Market",
      email: "olivia@cornerstone.example",
      phone: "+1 (212) 555-0141",
      channel: "Wholesale",
      balance: 480,
      address: "42 Hudson Street, New York, NY",
    },
    {
      name: "Phoenix Baker",
      company: "Green Basket Co.",
      email: "phoenix@greenbasket.example",
      phone: "+1 (212) 555-0182",
      channel: "Wholesale",
      balance: 1240,
      address: "18 Atlantic Avenue, Brooklyn, NY",
    },
    {
      name: "Lana Steiner",
      company: "",
      email: "lana.steiner@example.com",
      phone: "+1 (917) 555-0116",
      channel: "Retail",
      balance: 0,
    },
    {
      name: "Demi Wilkinson",
      company: "Brooklyn Pantry",
      email: "demi@brooklynpantry.example",
      phone: "+1 (718) 555-0130",
      channel: "Wholesale",
      balance: 0,
    },
    {
      name: "Drew Cano",
      email: "drew.cano@example.com",
      phone: "+1 (917) 555-0129",
      channel: "Retail",
      balance: 0,
    },
    {
      name: "Maya Thompson",
      company: "Sunday General",
      email: "maya@sundaygeneral.example",
      phone: "+1 (646) 555-0188",
      channel: "Wholesale",
      balance: 360,
    },
    {
      name: "Joshua Wilson",
      email: "joshua.w@example.com",
      phone: "+1 (917) 555-0165",
      channel: "Retail",
      balance: 0,
    },
    {
      name: "Sofia Chen",
      company: "The Little Corner",
      email: "sofia@littlecorner.example",
      phone: "+1 (212) 555-0177",
      channel: "Wholesale",
      balance: 0,
    },
    {
      name: "James Miller",
      email: "james.m@example.com",
      phone: "+1 (347) 555-0132",
      channel: "Retail",
      balance: 0,
    },
  ];
  const supplierData: RecordData[] = [
    {
      name: "Harvest & Co.",
      company: "Noah Williams",
      email: "orders@harvest.example",
      phone: "+1 (800) 555-0201",
      category: "Beverages",
      status: "Active",
      address: "Portland, OR",
      notes: "Net 30 terms. Free delivery on orders over $500.",
    },
    {
      name: "Mediterranean Goods",
      company: "Isabella Rossi",
      email: "hello@medgoods.example",
      phone: "+1 (800) 555-0202",
      category: "Pantry",
      status: "Active",
      address: "Newark, NJ",
      notes: "Net 15 terms. Orders ship within 2 business days.",
    },
    {
      name: "Meadow Naturals",
      company: "Ethan Brooks",
      email: "supply@meadownaturals.example",
      phone: "+1 (800) 555-0203",
      category: "Multiple categories",
      status: "Active",
      address: "Burlington, VT",
    },
    {
      name: "Freshway Distributors",
      company: "Ava Patel",
      email: "orders@freshway.example",
      phone: "+1 (800) 555-0204",
      category: "Fresh & dairy",
      status: "Active",
      address: "Queens, NY",
    },
    {
      name: "Good Earth Essentials",
      company: "Liam Davis",
      email: "hello@goodearth.example",
      phone: "+1 (800) 555-0205",
      category: "Personal care",
      status: "Active",
      address: "Austin, TX",
    },
  ];
  const sales: RecordData[] = [];
  for (let d = 59; d >= 0; d--) {
    for (let j = 0; j < 4; j++) {
      const wholesale = j === 0 || j === 2;
      const customer = customers[(d + j * 3) % customers.length];
      const ids = [(d * 3 + j) % 6, (d + j + 1) % 6];
      const items: LineItem[] = [...new Set(ids)].map((p, k) => ({
        productId: products[p].id,
        name: productData[p].name,
        quantity: wholesale
          ? (d < 30 ? 22 : 18) + ((d * 7 + j * 3 + k * 5) % 20)
          : 2 + ((d + j + k) % 7),
        price: productData[p].price!,
        cost: productData[p].cost!,
      }));
      const amount =
        Math.round(items.reduce((s, i) => s + i.price * i.quantity, 0) * 100) /
        100;
      sales.push({
        name: `#SW-${1001 + (59 - d) * 4 + j}`,
        customer: customer.company || customer.name,
        channel: wholesale ? "Wholesale" : "Retail",
        status: d < 3 && j === 2 ? "Pending" : "Completed",
        payment: d < 3 && j === 2 ? "Unpaid" : "Paid",
        date: date(d),
        items,
        amount,
        notes: wholesale
          ? "Wholesale order · standard delivery"
          : "In-store purchase",
      });
    }
  }
  const purchases: RecordData[] = [
    {
      name: "#PO-2041",
      supplier: "Mediterranean Goods",
      date: date(1),
      dueDate: date(-3),
      status: "Ordered",
      payment: "Unpaid",
      items: [
        {
          productId: products[1].id,
          name: productData[1].name,
          quantity: 80,
          price: 13,
          cost: 13,
        },
      ],
      amount: 1040,
    },
    {
      name: "#PO-2040",
      supplier: "Harvest & Co.",
      date: date(3),
      dueDate: date(-1),
      status: "Ordered",
      payment: "Paid",
      items: [
        {
          productId: products[4].id,
          name: productData[4].name,
          quantity: 60,
          price: 8.5,
          cost: 8.5,
        },
      ],
      amount: 510,
    },
    {
      name: "#PO-2039",
      supplier: "Freshway Distributors",
      date: date(4),
      dueDate: date(-1),
      status: "Ordered",
      payment: "Unpaid",
      items: [
        {
          productId: products[6].id,
          name: productData[6].name,
          quantity: 96,
          price: 2.1,
          cost: 2.1,
        },
      ],
      amount: 201.6,
    },
    {
      name: "#PO-2038",
      supplier: "Harvest & Co.",
      date: date(8),
      dueDate: date(4),
      status: "Received",
      payment: "Paid",
      items: [
        {
          productId: products[0].id,
          name: productData[0].name,
          quantity: 200,
          price: 9.2,
          cost: 9.2,
        },
      ],
      amount: 1840,
    },
    {
      name: "#PO-2037",
      supplier: "Meadow Naturals",
      date: date(12),
      dueDate: date(8),
      status: "Received",
      payment: "Paid",
      items: [
        {
          productId: products[3].id,
          name: productData[3].name,
          quantity: 100,
          price: 7.2,
          cost: 7.2,
        },
      ],
      amount: 720,
    },
  ];
  const expenses: RecordData[] = [
    {
      name: "Store rent",
      amount: 2400,
      category: "Rent",
      date: date(20),
      payment: "Bank transfer",
      status: "Paid",
    },
    {
      name: "Electricity & water",
      amount: 186.5,
      category: "Utilities",
      date: date(12),
      payment: "Bank transfer",
      status: "Paid",
    },
    {
      name: "Team payroll",
      amount: 3250,
      category: "Payroll",
      date: date(5),
      payment: "Bank transfer",
      status: "Paid",
    },
    {
      name: "Local Instagram campaign",
      amount: 250,
      category: "Marketing",
      date: date(10),
      payment: "Credit card",
      status: "Paid",
    },
    {
      name: "Packaging & paper bags",
      amount: 124.8,
      category: "Supplies",
      date: date(4),
      payment: "Credit card",
      status: "Paid",
    },
    {
      name: "Wholesale delivery service",
      amount: 320,
      category: "Shipping",
      date: date(2),
      payment: "Bank transfer",
      status: "Unpaid",
    },
  ];
  const team: RecordData[] = [
    {
      name: "Jamie Lee",
      email: "jamie@everyday.example",
      role: "Manager",
      status: "Active",
      phone: "+1 (212) 555-0104",
    },
    {
      name: "Sam Rivera",
      email: "sam@everyday.example",
      role: "Sales associate",
      status: "Active",
      phone: "+1 (212) 555-0105",
    },
    {
      name: "Taylor Kim",
      email: "taylor@everyday.example",
      role: "Inventory manager",
      status: "Active",
      phone: "+1 (212) 555-0106",
    },
    {
      name: "Jordan Ellis",
      email: "jordan@everyday.example",
      role: "Accountant",
      status: "Invited",
      notes: "Onboarding next week.",
    },
  ];
  const groups: [Resource, RecordData[]][] = [
    ["customers", customers],
    ["suppliers", supplierData],
    ["sales", sales],
    ["purchases", purchases],
    ["expenses", expenses],
    ["team", team],
  ];
  await executor
    .insert(records)
    .values([
      ...products,
      ...groups.flatMap(([resource, data]) =>
        data.map((item) => ({
          id: randomUUID(),
          userId,
          resource,
          data: item,
        })),
      ),
    ]);
}
