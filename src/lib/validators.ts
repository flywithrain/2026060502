import type { OrderRow, ValidationError } from "@/types";

export function validateOrders(rows: OrderRow[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const phoneRegex = /^1[3-9]\d{9}$/;

  for (const row of rows) {
    const ri = row.rowIndex;

    // A组/B组二选一必填
    const hasGroupA = !!row.storeName?.trim();
    const hasGroupB =
      !!row.receiverName?.trim() &&
      !!row.receiverPhone?.trim() &&
      !!row.receiverAddress?.trim();

    if (!hasGroupA && !hasGroupB) {
      errors.push({
        rowIndex: ri,
        field: "storeName",
        message: "A组(收货门店)或B组(收件人姓名/电话/地址)至少填写一组",
      });
    }

    // 必填字段
    if (!row.skuCode?.trim()) {
      errors.push({ rowIndex: ri, field: "skuCode", message: "SKU物品编码为必填项" });
    }
    if (!row.skuName?.trim()) {
      errors.push({ rowIndex: ri, field: "skuName", message: "SKU物品名称为必填项" });
    }
    if (row.skuQuantity == null || row.skuQuantity <= 0 || isNaN(Number(row.skuQuantity))) {
      errors.push({ rowIndex: ri, field: "skuQuantity", message: "SKU发货数量必须为正数" });
    }

    // 电话格式校验
    if (row.receiverPhone?.trim() && !phoneRegex.test(row.receiverPhone.trim())) {
      errors.push({ rowIndex: ri, field: "receiverPhone", message: "收件人电话格式不正确" });
    }
  }

  return errors;
}

export function validateSingleRow(row: OrderRow): ValidationError[] {
  return validateOrders([row]);
}

export function checkExternalCodeDuplicates(
  rows: OrderRow[],
  existingCodes?: Set<string>
): ValidationError[] {
  const errors: ValidationError[] = [];
  const seen = new Map<string, number>();

  for (const row of rows) {
    const code = row.externalCode?.trim();
    if (!code) continue;

    const prev = seen.get(code);
    if (prev !== undefined) {
      errors.push({
        rowIndex: row.rowIndex,
        field: "externalCode",
        message: `外部编码"${code}"与第${prev + 1}行重复`,
      });
    } else {
      seen.set(code, row.rowIndex);
    }

    if (existingCodes?.has(code)) {
      errors.push({
        rowIndex: row.rowIndex,
        field: "externalCode",
        message: `外部编码"${code}"已存在于数据库中`,
      });
    }
  }

  return errors;
}
