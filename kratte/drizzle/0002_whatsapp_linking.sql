ALTER TABLE "shop_users" ADD COLUMN "whatsapp_number" text;
ALTER TABLE "shop_users" ADD CONSTRAINT "shop_users_whatsapp_number_unique" UNIQUE("whatsapp_number");
ALTER TABLE "shop_users" ADD COLUMN "whatsapp_link_code" text;
ALTER TABLE "shop_users" ADD COLUMN "whatsapp_link_code_expires" timestamp;
CREATE INDEX "shop_users_whatsapp_number_idx" ON "shop_users" USING btree ("whatsapp_number");
