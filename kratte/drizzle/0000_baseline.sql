CREATE TABLE "shop_mutation_requests" (
	"user_id" uuid NOT NULL,
	"key" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shop_mutation_requests_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "shop_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"resource" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"name" text NOT NULL,
	"store_name" text DEFAULT 'The Everyday Store' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"settings" jsonb DEFAULT '{"currency":"USD","timezone":"America/New_York","lowStockAlerts":true,"orderNotifications":true,"weeklyDigest":true,"plan":"Starter"}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shop_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "shop_mutation_requests" ADD CONSTRAINT "shop_mutation_requests_user_id_shop_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."shop_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_records" ADD CONSTRAINT "shop_records_user_id_shop_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."shop_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_sessions" ADD CONSTRAINT "shop_sessions_user_id_shop_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."shop_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shop_records_owner_resource_idx" ON "shop_records" USING btree ("user_id","resource");