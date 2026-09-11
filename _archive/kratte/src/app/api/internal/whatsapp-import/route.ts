import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { users, records } from "@/db/schema";
import { withApi, HttpError, ValidationError } from "@/lib/http-error";
import { mutateRecord } from "@/lib/store";
import { readJson } from "@/lib/request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CATEGORY_OPTIONS = [
  "Beverages",
  "Pantry",
  "Fresh & dairy",
  "Snacks",
  "Personal care",
  "Household",
  "Other",
] as const;

type ImportItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  categoryGuess?: string;
};

function normalize(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "item"}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Called by KuachaFlo's WhatsApp webhook after Gemini extracts line items
 * from a photo of a sales sheet/till tally. Not user-session authenticated
 * — this is a service-to-service call, gated by a shared secret instead,
 * since there's no browser session for a WhatsApp message.
 */
export async function POST(request: Request) {
  return withApi(request, "whatsapp.import", async () => {
    const expectedKey = process.env.INTERNAL_API_KEY;
    if (!expectedKey)
      throw new HttpError("Internal API is not configured.", 503, "NOT_CONFIGURED");
    if (request.headers.get("x-internal-key") !== expectedKey)
      throw new HttpError("Invalid internal key.", 401, "UNAUTHORIZED");

    const input = await readJson(request, 32 * 1024);
    const whatsappNumber = String(input.whatsappNumber || "");
    const items = Array.isArray(input.items) ? (input.items as ImportItem[]) : [];
    if (!whatsappNumber) throw new ValidationError("whatsappNumber is required.");
    if (!items.length) throw new ValidationError("At least one item is required.");
    if (items.length > 100) throw new ValidationError("Too many items in one sheet.");

    const [account] = await db
      .select()
      .from(users)
      .where(eq(users.whatsappNumber, whatsappNumber));
    if (!account)
      throw new HttpError("No KraTte account linked to this number.", 404, "NOT_LINKED");

    const inventory = await db
      .select()
      .from(records)
      .where(and(eq(records.userId, account.id), eq(records.resource, "inventory")));
    const byName = new Map(inventory.map((row) => [normalize(row.data.name), row.id]));

    const created: string[] = [];
    const lineItems: { productId: string; quantity: number }[] = [];

    for (const raw of items) {
      const name = String(raw.name || "").trim().slice(0, 500);
      const quantity = Math.max(1, Math.min(100000, Math.round(Number(raw.quantity) || 1)));
      const unitPrice = Math.max(0, Number(raw.unitPrice) || 0);
      if (!name) continue;

      let productId = byName.get(normalize(name));
      if (!productId) {
        const category = CATEGORY_OPTIONS.includes(raw.categoryGuess as never)
          ? raw.categoryGuess
          : "Other";
        const { record } = await mutateRecord(account.id, "inventory", {
          name,
          sku: slugify(name),
          category,
          price: unitPrice,
          cost: unitPrice, // unknown from a sales photo — flagged to the merchant to correct
          stock: quantity, // exactly covers this sale; avoids fabricating extra stock
          reorderAt: 0,
        });
        if (!record) continue;
        productId = record.id;
        byName.set(normalize(name), productId);
        created.push(name);
      }
      lineItems.push({ productId, quantity });
    }

    if (!lineItems.length)
      throw new ValidationError("None of the items could be matched or created.");

    const { record: sale } = await mutateRecord(account.id, "sales", {
      items: lineItems,
      status: "Completed",
      customer: "Walk-in",
      channel: "WhatsApp",
      payment: "Cash",
      date: new Date().toISOString().slice(0, 10),
    });

    return NextResponse.json({
      saleName: sale?.name,
      amount: sale?.amount,
      itemCount: lineItems.length,
      newProducts: created,
    });
  });
}
