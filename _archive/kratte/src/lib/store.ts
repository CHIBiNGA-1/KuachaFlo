import "server-only";
import { createHash } from "node:crypto";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db, type Transaction } from "@/db";
import { records, users, mutationRequests, orderSequences } from "@/db/schema";
import { assertSession } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { HttpError, ValidationError } from "@/lib/http-error";
import { objectInput, positiveInteger, UUID_PATTERN } from "@/lib/request";
import { orderAmount, moneyValue } from "@/lib/money";
import { validateRecordData } from "@/lib/validation";
import type {
  Entity,
  RecordData,
  Resource,
  LineItem,
  MutationResult,
} from "@/lib/types";
export { parseResource } from "@/lib/validation";
export const validateData = validateRecordData;
export const toEntity = (row: typeof records.$inferSelect): Entity => ({
  ...row.data,
  id: row.id,
  resource: row.resource as Resource,
  version: row.version,
});

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
async function nextOrderReference(
  tx: Transaction,
  userId: string,
  resource: "sales" | "purchases",
) {
  const prefix = resource === "sales" ? "#SW-" : "#PO-";
  const [existing] = await tx
    .select()
    .from(orderSequences)
    .where(
      and(
        eq(orderSequences.userId, userId),
        eq(orderSequences.resource, resource),
      ),
    );
  let next: number;
  if (existing) {
    next = existing.value + 1;
    await tx
      .update(orderSequences)
      .set({ value: next })
      .where(
        and(
          eq(orderSequences.userId, userId),
          eq(orderSequences.resource, resource),
        ),
      );
  } else {
    const [maximum] = await tx
      .select({
        value: sql<string>`coalesce(max(CASE WHEN ${records.data}->>'name' ~ ${`^${prefix}[0-9]{1,12}$`} THEN substring(${records.data}->>'name' from '[0-9]+$')::bigint ELSE 0 END), 0)`,
      })
      .from(records)
      .where(and(eq(records.userId, userId), eq(records.resource, resource)));
    next =
      Math.max(Number(maximum.value), resource === "sales" ? 1000 : 2000) + 1;
    await tx.insert(orderSequences).values({ userId, resource, value: next });
  }
  return `${prefix}${next}`;
}
export async function mutateRecord(
  userId: string,
  resource: Resource,
  input?: Record<string, unknown>,
  id?: string,
  remove = false,
  requestKey?: string | null,
  context?: { requestId: string; sessionId: string },
): Promise<MutationResult> {
  if (id && !UUID_PATTERN.test(id))
    throw new ValidationError("Invalid record ID.");
  if (requestKey && !UUID_PATTERN.test(requestKey))
    throw new ValidationError("Invalid request key.");
  if (input !== undefined) objectInput(input);
  if (input?.id !== undefined && id !== input.id)
    throw new ValidationError("The record ID does not match this request.");
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify(
        canonical({ resource, input: input ?? null, id: id ?? null, remove }),
      ),
    )
    .digest("hex");
  return db.transaction(async (tx) => {
    const [owner] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!owner)
      throw new HttpError(
        "Your workspace is no longer available.",
        401,
        "SESSION_EXPIRED",
      );
    if (context) await assertSession(tx, userId, context.sessionId);
    if (requestKey) {
      const [previous] = await tx
        .select()
        .from(mutationRequests)
        .where(
          and(
            eq(mutationRequests.userId, userId),
            eq(mutationRequests.key, requestKey),
          ),
        );
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          throw new HttpError(
            "This retry belongs to different changes. Reopen the form and try again.",
            409,
            "REQUEST_CONFLICT",
          );
        const savedId = previous.response.record?.id;
        const [current] = savedId
          ? await tx
              .select()
              .from(records)
              .where(and(eq(records.userId, userId), eq(records.id, savedId)))
          : [];
        if (savedId && !current)
          throw new HttpError(
            "This request was already applied, but its record has since been deleted.",
            409,
            "REQUEST_ALREADY_APPLIED",
          );
        const productIds = previous.response.inventory.map(
          (product) => product.id,
        );
        const freshInventory = productIds.length
          ? await tx
              .select()
              .from(records)
              .where(
                and(
                  eq(records.userId, userId),
                  eq(records.resource, "inventory"),
                  inArray(records.id, productIds),
                ),
              )
          : [];
        // Replay the committed operation without replaying stale stock/record snapshots.
        return {
          record: current ? toEntity(current) : null,
          inventory: freshInventory.map(toEntity),
        };
      }
    }
    const [old] = id
      ? await tx
          .select()
          .from(records)
          .where(
            and(
              eq(records.id, id),
              eq(records.userId, userId),
              eq(records.resource, resource),
            ),
          )
          .for("update")
      : [];
    if (id && !old) throw new ValidationError("This record no longer exists.");
    if (input?.expectedVersion !== undefined) {
      positiveInteger(input.expectedVersion, "Expected version", 1, 2147483647);
      if (!old || old.version !== input.expectedVersion)
        throw new HttpError(
          "This record changed while you were editing. Reload its details before saving.",
          409,
          "VERSION_CONFLICT",
        );
    }
    if (old && resource === "inventory" && input?.expectedStock !== undefined) {
      positiveInteger(input.expectedStock, "Expected stock", 0);
      if ((old.data.stock || 0) !== input.expectedStock)
        throw new HttpError(
          "Stock changed while this card was open. Close and reopen Quick edit to use the latest count.",
          409,
          "STOCK_CHANGED",
        );
    }
    const next = remove
      ? null
      : validateRecordData(
          resource,
          old ? { ...old.data, ...input } : input || {},
        );
    const inventory: Entity[] = [];
    if (resource === "inventory") {
      if (remove) {
        const [related] = await tx
          .select({ id: records.id })
          .from(records)
          .where(
            and(
              eq(records.userId, userId),
              inArray(records.resource, ["sales", "purchases"]),
              sql`${records.data} @> ${JSON.stringify({ items: [{ productId: id }] })}::jsonb`,
            ),
          )
          .limit(1);
        if (related)
          throw new ValidationError(
            "This product is linked to order history. Keep it for your records, or remove the linked orders first.",
          );
      } else {
        const [duplicate] = await tx
          .select({ id: records.id })
          .from(records)
          .where(
            and(
              eq(records.userId, userId),
              eq(records.resource, "inventory"),
              sql`lower(btrim(${records.data}->>'sku')) = ${next!.sku!.toLowerCase()}`,
              id ? ne(records.id, id) : undefined,
            ),
          )
          .limit(1);
        if (duplicate)
          throw new ValidationError("A product with this SKU already exists.");
      }
    }
    if (resource === "sales" || resource === "purchases") {
      const productIds = [
        ...new Set(
          [...(old?.data.items || []), ...(next?.items || [])].map(
            (item) => item.productId,
          ),
        ),
      ].sort();
      const productRows = productIds.length
        ? await tx
            .select()
            .from(records)
            .where(
              and(
                eq(records.userId, userId),
                eq(records.resource, "inventory"),
                inArray(records.id, productIds),
              ),
            )
            .orderBy(asc(records.id))
            .for("update")
        : [];
      const products = new Map(
        productRows.map((product) => [product.id, product]),
      );
      if (next) {
        next.name = old
          ? old.data.name
          : await nextOrderReference(tx, userId, resource);
        const combined = new Map<string, LineItem>();
        for (const item of next.items || []) {
          const product = products.get(item.productId);
          if (!product)
            throw new ValidationError(
              "One of the selected products is no longer available.",
            );
          const previous = old?.data.items?.find(
            (row) => row.productId === item.productId,
          );
          const quantity =
            item.quantity + (combined.get(item.productId)?.quantity || 0);
          if (quantity > 100000)
            throw new ValidationError(
              "An order cannot contain more than 100,000 units of one product.",
            );
          combined.set(item.productId, {
            productId: item.productId,
            name: product.data.name,
            quantity,
            price: moneyValue(
              previous?.price ??
                (resource === "sales"
                  ? product.data.price || 0
                  : product.data.cost || 0),
            ),
            cost: moneyValue(previous?.cost ?? product.data.cost ?? 0),
          });
        }
        next.items = [...combined.values()];
        next.amount = orderAmount(next.items);
      }
      const deltas = new Map<string, number>();
      const apply = (
        data: RecordData | undefined | null,
        multiplier: number,
      ) => {
        if (
          !data ||
          data.status !== (resource === "sales" ? "Completed" : "Received")
        )
          return;
        for (const item of data.items || [])
          deltas.set(
            item.productId,
            (deltas.get(item.productId) || 0) +
              item.quantity * multiplier * (resource === "sales" ? -1 : 1),
          );
      };
      apply(old?.data, -1);
      apply(next, 1);
      for (const [productId, delta] of deltas) {
        if (!delta) continue;
        const product = products.get(productId);
        if (!product)
          throw new ValidationError("A linked product no longer exists.");
        const before = product.data.stock || 0;
        const stock = before + delta;
        if (stock < 0)
          throw new ValidationError(
            `Not enough stock for ${product.data.name}. ${before} units available. Adjust the quantity or order status.`,
          );
        positiveInteger(stock, "Resulting stock", 0);
        const [updated] = await tx
          .update(records)
          .set({
            data: { ...product.data, stock },
            version: sql`${records.version} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(records.id, productId))
          .returning();
        inventory.push(toEntity(updated));
        if (context)
          await appendAudit(tx, {
            userId,
            requestId: context.requestId,
            action: "inventory.movement",
            resource: "inventory",
            recordId: productId,
            metadata: {
              stock: { from: before, to: stock },
              version: updated.version,
            },
          });
      }
    }
    let record: Entity | null = null;
    if (remove && id)
      await tx
        .delete(records)
        .where(and(eq(records.id, id), eq(records.userId, userId)));
    else {
      if (!next) throw new ValidationError("No record data was provided.");
      const [saved] = id
        ? await tx
            .update(records)
            .set({
              data: next,
              version: sql`${records.version} + 1`,
              updatedAt: new Date(),
            })
            .where(and(eq(records.id, id), eq(records.userId, userId)))
            .returning()
        : await tx
            .insert(records)
            .values({ userId, resource, data: next })
            .returning();
      record = toEntity(saved);
    }
    if (context)
      await appendAudit(tx, {
        userId,
        requestId: context.requestId,
        resource,
        action: remove
          ? "record.deleted"
          : old
            ? "record.updated"
            : "record.created",
        recordId: record?.id || id,
        metadata: {
          fields: Object.keys(next || old?.data || {}).filter(
            (key) =>
              !old ||
              JSON.stringify(old.data[key as keyof RecordData]) !==
                JSON.stringify(next?.[key as keyof RecordData]),
          ),
          ...(record ? { version: record.version } : {}),
          ...(resource === "inventory" &&
          old &&
          next &&
          old.data.stock !== next.stock
            ? { stock: { from: old.data.stock || 0, to: next.stock || 0 } }
            : {}),
        },
      });
    const response = { record, inventory };
    if (requestKey)
      await tx
        .insert(mutationRequests)
        .values({ userId, key: requestKey, fingerprint, response });
    return response;
  });
}
