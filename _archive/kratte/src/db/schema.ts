import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
  primaryKey,
  integer,
  bigint,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import type { RecordData, StoreSettings, MutationResult } from "@/lib/types";

export const users = pgTable(
  "shop_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash"),
    name: text("name").notNull(),
    storeName: text("store_name").notNull().default("The Everyday Store"),
    isDemo: boolean("is_demo").notNull().default(false),
    settings: jsonb("settings")
      .$type<StoreSettings>()
      .notNull()
      .default({
        currency: "USD",
        timezone: "America/New_York",
        lowStockAlerts: true,
        orderNotifications: true,
        weeklyDigest: true,
        plan: "Starter",
      }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    // WhatsApp sales-photo capture linking — populated once the account
    // links a number via Settings; link_code fields are transient,
    // cleared once linking succeeds.
    whatsappNumber: text("whatsapp_number").unique(),
    whatsappLinkCode: text("whatsapp_link_code"),
    whatsappLinkCodeExpires: timestamp("whatsapp_link_code_expires"),
  },
  (table) => [
    uniqueIndex("shop_users_email_normalized_idx").on(
      sql`lower(btrim(${table.email}))`,
    ),
    check(
      "shop_users_account_password_check",
      sql`${table.isDemo} OR ${table.passwordHash} IS NOT NULL`,
    ),
    index("shop_users_demo_cleanup_idx")
      .on(table.createdAt)
      .where(sql`${table.isDemo} = true`),
  ],
);

export const sessions = pgTable(
  "shop_sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("shop_sessions_owner_idx").on(table.userId),
    index("shop_sessions_expiry_idx").on(table.expiresAt),
  ],
);

export const records = pgTable(
  "shop_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    resource: text("resource").notNull(),
    data: jsonb("data").$type<RecordData>().notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("shop_records_owner_resource_idx").on(table.userId, table.resource),
    index("shop_records_page_idx").on(
      table.userId,
      table.resource,
      table.createdAt,
      table.id,
    ),
    index("shop_records_data_gin_idx").using("gin", table.data),
    uniqueIndex("shop_inventory_sku_unique_idx")
      .on(table.userId, sql`lower(btrim(${table.data}->>'sku'))`)
      .where(sql`${table.resource} = 'inventory'`),
    uniqueIndex("shop_order_reference_unique_idx")
      .on(table.userId, table.resource, sql`(${table.data}->>'name')`)
      .where(sql`${table.resource} IN ('sales','purchases')`),
    check(
      "shop_record_resource_check",
      sql`${table.resource} IN ('inventory','sales','customers','suppliers','purchases','expenses','team')`,
    ),
    check(
      "shop_record_data_check",
      sql`(jsonb_typeof(${table.data}) = 'object' AND jsonb_typeof(${table.data}->'name') = 'string' AND char_length(btrim(${table.data}->>'name')) BETWEEN 1 AND 500) IS TRUE`,
    ),
    check("shop_record_version_check", sql`${table.version} > 0`),
    check(
      "shop_inventory_numbers_check",
      sql`${table.resource} <> 'inventory' OR (
    jsonb_typeof(${table.data}->'stock') = 'number' AND (${table.data}->>'stock')::numeric BETWEEN 0 AND 1000000000 AND trunc((${table.data}->>'stock')::numeric) = (${table.data}->>'stock')::numeric
    AND jsonb_typeof(${table.data}->'price') = 'number' AND (${table.data}->>'price')::numeric BETWEEN 0 AND 1000000000
    AND jsonb_typeof(${table.data}->'cost') = 'number' AND (${table.data}->>'cost')::numeric BETWEEN 0 AND 1000000000
    AND char_length(btrim(${table.data}->>'sku')) BETWEEN 1 AND 500
  ) IS TRUE`,
    ),
  ],
);

export const mutationRequests = pgTable(
  "shop_mutation_requests",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: uuid("key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    response: jsonb("response").$type<MutationResult>().notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.key] })],
);

export const rateLimits = pgTable(
  "shop_rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("shop_rate_limits_expiry_idx").on(table.resetAt)],
);

export const orderSequences = pgTable(
  "shop_order_sequences",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    resource: text("resource").notNull(),
    value: bigint("value", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.resource] }),
    check(
      "shop_order_sequence_resource_check",
      sql`${table.resource} IN ('sales','purchases')`,
    ),
    check(
      "shop_order_sequence_range_check",
      sql`${table.value} > 0 AND ${table.value} < 9007199254740991`,
    ),
  ],
);

export type AuditMetadata = {
  fields?: string[];
  stock?: { from: number; to: number };
  version?: number;
  count?: number;
};
export const auditEvents = pgTable(
  "shop_audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    resource: text("resource").notNull(),
    recordId: uuid("record_id"),
    requestId: text("request_id").notNull(),
    metadata: jsonb("metadata").$type<AuditMetadata>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("shop_audit_events_owner_page_idx").on(
      table.userId,
      table.createdAt,
      table.id,
    ),
  ],
);
