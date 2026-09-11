CREATE TABLE "shop_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"record_id" uuid,
	"request_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_order_sequences" (
	"user_id" uuid NOT NULL,
	"resource" text NOT NULL,
	"value" bigint NOT NULL,
	CONSTRAINT "shop_order_sequences_user_id_resource_pk" PRIMARY KEY("user_id","resource"),
	CONSTRAINT "shop_order_sequence_resource_check" CHECK ("shop_order_sequences"."resource" IN ('sales','purchases')),
	CONSTRAINT "shop_order_sequence_range_check" CHECK ("shop_order_sequences"."value" > 0 AND "shop_order_sequences"."value" < 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE "shop_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shop_records" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_sessions" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_audit_events" ADD CONSTRAINT "shop_audit_events_user_id_shop_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."shop_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_order_sequences" ADD CONSTRAINT "shop_order_sequences_user_id_shop_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."shop_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shop_audit_events_owner_page_idx" ON "shop_audit_events" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "shop_rate_limits_expiry_idx" ON "shop_rate_limits" USING btree ("reset_at");--> statement-breakpoint
CREATE INDEX "shop_records_page_idx" ON "shop_records" USING btree ("user_id","resource","created_at","id");--> statement-breakpoint
CREATE INDEX "shop_records_data_gin_idx" ON "shop_records" USING gin ("data");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_inventory_sku_unique_idx" ON "shop_records" USING btree ("user_id",lower(btrim("data"->>'sku'))) WHERE "shop_records"."resource" = 'inventory';--> statement-breakpoint
CREATE UNIQUE INDEX "shop_order_reference_unique_idx" ON "shop_records" USING btree ("user_id","resource",("data"->>'name')) WHERE "shop_records"."resource" IN ('sales','purchases');--> statement-breakpoint
CREATE INDEX "shop_sessions_owner_idx" ON "shop_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shop_sessions_expiry_idx" ON "shop_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_users_email_normalized_idx" ON "shop_users" USING btree (lower(btrim("email")));--> statement-breakpoint
CREATE INDEX "shop_users_demo_cleanup_idx" ON "shop_users" USING btree ("created_at") WHERE "shop_users"."is_demo" = true;--> statement-breakpoint
ALTER TABLE "shop_records" ADD CONSTRAINT "shop_record_resource_check" CHECK ("shop_records"."resource" IN ('inventory','sales','customers','suppliers','purchases','expenses','team'));--> statement-breakpoint
ALTER TABLE "shop_records" ADD CONSTRAINT "shop_record_data_check" CHECK ((jsonb_typeof("shop_records"."data") = 'object' AND jsonb_typeof("shop_records"."data"->'name') = 'string' AND char_length(btrim("shop_records"."data"->>'name')) BETWEEN 1 AND 500) IS TRUE);--> statement-breakpoint
ALTER TABLE "shop_records" ADD CONSTRAINT "shop_record_version_check" CHECK ("shop_records"."version" > 0);--> statement-breakpoint
ALTER TABLE "shop_records" ADD CONSTRAINT "shop_inventory_numbers_check" CHECK ("shop_records"."resource" <> 'inventory' OR (
    jsonb_typeof("shop_records"."data"->'stock') = 'number' AND ("shop_records"."data"->>'stock')::numeric BETWEEN 0 AND 1000000000 AND trunc(("shop_records"."data"->>'stock')::numeric) = ("shop_records"."data"->>'stock')::numeric
    AND jsonb_typeof("shop_records"."data"->'price') = 'number' AND ("shop_records"."data"->>'price')::numeric BETWEEN 0 AND 1000000000
    AND jsonb_typeof("shop_records"."data"->'cost') = 'number' AND ("shop_records"."data"->>'cost')::numeric BETWEEN 0 AND 1000000000
    AND char_length(btrim("shop_records"."data"->>'sku')) BETWEEN 1 AND 500
  ) IS TRUE);--> statement-breakpoint
ALTER TABLE "shop_users" ADD CONSTRAINT "shop_users_account_password_check" CHECK ("shop_users"."is_demo" OR "shop_users"."password_hash" IS NOT NULL);