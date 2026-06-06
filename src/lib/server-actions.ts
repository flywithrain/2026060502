"use server";

import { db, sql } from "@/lib/db";
import { parseRules, orders } from "@/lib/db-schema";
import { eq, ilike, desc, and, inArray, sql as drizzleSql } from "drizzle-orm";
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

// 复制规则：读取原规则 → 以"原名 - 副本"另存
export async function duplicateRule(id: string): Promise<string> {
  const rule = await getRule(id);
  if (!rule) throw new Error("规则不存在");
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = rule;
  return saveRule({ ...rest, name: `${rule.name} - 副本` });
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
): Promise<{ success: number; failed: number; errors: { rowIndex: number; message: string }[] }> {
  let success = 0;
  let failed = 0;
  const errors: { rowIndex: number; message: string }[] = [];

  const records = orderRows.map((row) => ({
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
  }));

  const BATCH = 200;
  for (let i = 0; i < records.length; i += BATCH) {
    const chunk = records.slice(i, i + BATCH);
    try {
      // 单条 SQL 多值批量插入，避免逐条往返
      await db.insert(orders).values(chunk);
      success += chunk.length;
    } catch {
      // 整批失败时逐条重试以定位失败行
      for (let j = 0; j < chunk.length; j++) {
        try {
          await db.insert(orders).values(chunk[j]);
          success++;
        } catch (e2) {
          failed++;
          errors.push({ rowIndex: i + j, message: e2 instanceof Error ? e2.message : String(e2) });
        }
      }
    }
  }

  return { success, failed, errors };
}

export async function getExistingExternalCodes(codes?: string[]): Promise<Set<string>> {
  // 传入 codes 时只查这些编码（避免全表拉取）；为空数组直接返回空
  if (codes && codes.length === 0) return new Set();

  const whereClause = codes && codes.length > 0
    ? and(drizzleSql`${orders.externalCode} IS NOT NULL`, inArray(orders.externalCode, codes))
    : drizzleSql`${orders.externalCode} IS NOT NULL`;

  const result = await db
    .select({ code: orders.externalCode })
    .from(orders)
    .where(whereClause);

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
