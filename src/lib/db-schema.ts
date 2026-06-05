import { pgTable, uuid, varchar, text, numeric, timestamp, jsonb } from "drizzle-orm/pg-core";

export const parseRules = pgTable("parse_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  config: jsonb("config").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  externalCode: varchar("external_code", { length: 255 }),
  storeName: varchar("store_name", { length: 255 }),
  receiverName: varchar("receiver_name", { length: 255 }),
  receiverPhone: varchar("receiver_phone", { length: 50 }),
  receiverAddress: text("receiver_address"),
  skuCode: varchar("sku_code", { length: 255 }).notNull(),
  skuName: varchar("sku_name", { length: 500 }).notNull(),
  skuQuantity: numeric("sku_quantity").notNull(),
  skuSpec: varchar("sku_spec", { length: 500 }),
  remark: text("remark"),
  batchId: uuid("batch_id").notNull(),
  submittedAt: timestamp("submitted_at").defaultNow(),
});
