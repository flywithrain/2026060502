"use server";

import { db, sql } from "@/lib/db";
import { parseRules, orders } from "@/lib/db-schema";
import { eq, ilike, desc, and, or, sql as drizzleSql } from "drizzle-orm";
import type { ParseRule } from "@/types";
import { generateId } from "@/lib/utils";

// ====== 规则 CRUD ======
export async function saveRule(rule: Omit<ParseRule, "id" | "createdAt" | "updatedAt">): Promise<string> {
  const id = generateId();
  const config = JSON.parse(JSON.stringify(rule));

  await db.insert(parseRules).values({
    id,
    name: rule.name,
    description: rule.description,
    config,
  });

  return id;
}

export async function updateRule(id: string, rule: Omit<ParseRule, "id" | "createdAt" | "updatedAt">): Promise<void> {
  const config = JSON.parse(JSON.stringify(rule));

  await db
    .update(parseRules)
    .set({
      name: rule.name,
      description: rule.description,
      config,
      updatedAt: new Date(),
    })
    .where(eq(parseRules.id, id));
}

export async function deleteRule(id: string): Promise<void> {
  await db.delete(parseRules).where(eq(parseRules.id, id));
}

export async function getRule(id: string): Promise<ParseRule | null> {
  const result = await db.select().from(parseRules).where(eq(parseRules.id, id)).limit(1);
  if (result.length === 0) return null;

  const row = result[0];
  return {
    id: row.id,
    ...(row.config as Omit<ParseRule, "id" | "createdAt" | "updatedAt">),
    createdAt: row.createdAt?.toISOString(),
    updatedAt: row.updatedAt?.toISOString(),
  } as ParseRule;
}

export async function getAllRules(): Promise<ParseRule[]> {
  const result = await db.select().from(parseRules).orderBy(desc(parseRules.updatedAt));

  return result.map((row) => ({
    id: row.id,
    ...(row.config as Omit<ParseRule, "id" | "createdAt" | "updatedAt">),
    createdAt: row.createdAt?.toISOString(),
    updatedAt: row.updatedAt?.toISOString(),
  })) as ParseRule[];
}

// ====== 运单 CRUD ======
export async function submitOrders(
  orderRows: { externalCode: string; storeName: string; receiverName: string; receiverPhone: string; receiverAddress: string; skuCode: string; skuName: string; skuQuantity: number; skuSpec: string; remark: string }[],
  batchId: string
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const row of orderRows) {
    const values = {
      externalCode: row.externalCode || null,
      storeName: row.storeName || null,
      receiverName: row.receiverName || null,
      receiverPhone: row.receiverPhone || null,
      receiverAddress: row.receiverAddress || null,
      skuCode: row.skuCode,
      skuName: row.skuName,
      skuQuantity: String(row.skuQuantity),
      skuSpec: row.skuSpec || null,
      remark: row.remark || null,
      batchId,
    };

    await db.insert(orders).values(values);
    success++;
  }

  return { success, failed };
}

export async function getExistingExternalCodes(): Promise<Set<string>> {
  const result = await db
    .select({ code: orders.externalCode })
    .from(orders)
    .where(drizzleSql`${orders.externalCode} IS NOT NULL`);

  return new Set(result.map((r) => r.code).filter(Boolean) as string[]);
}

export async function getOrdersPage(
  page: number,
  pageSize: number,
  search?: string,
  receiverName?: string,
  startDate?: string,
  endDate?: string
): Promise<{ rows: typeof orders.$inferSelect[]; total: number }> {
  let conditions = [];

  if (search) {
    conditions.push(ilike(orders.externalCode, `%${search}%`));
  }
  if (receiverName) {
    conditions.push(ilike(orders.receiverName, `%${receiverName}%`));
  }
  if (startDate) {
    conditions.push(drizzleSql`${orders.submittedAt} >= ${new Date(startDate)}`);
  }
  if (endDate) {
    conditions.push(drizzleSql`${orders.submittedAt} <= ${new Date(endDate + "T23:59:59")}`);
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ count: drizzleSql<number>`count(*)` })
    .from(orders)
    .where(whereClause)
    .execute();

  const total = Number(countResult?.count || 0);

  const rows = await db
    .select()
    .from(orders)
    .where(whereClause)
    .orderBy(desc(orders.submittedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { rows, total };
}
