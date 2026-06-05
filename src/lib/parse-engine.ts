import type { ParsedFile, ParseRule, OrderRow, RawRow, KvExtractConfig, KvEntry, FieldMapping } from "@/types";

// ====== KV 对提取 ======
// 在一行中扫描标签，取标签右侧列的值
function extractKvPairs(rows: RawRow[], kvConfigs: KvExtractConfig[] | undefined, dataStartRow: number, totalRows: number): Record<string, string> {
  const result: Record<string, string> = {};
  if (!kvConfigs) return result;

  for (const config of kvConfigs) {
    for (const relRow of config.rows) {
      // 正数: 从 dataStartRow 起偏移；负数: 从末尾倒数
      const actualRow = relRow >= 0 ? dataStartRow + relRow : totalRows + relRow;
      if (actualRow < 0 || actualRow >= totalRows) continue;

      const row = rows[actualRow];
      if (!row) continue;

      for (const entry of config.entries) {
        for (let ci = 0; ci < row.cells.length; ci++) {
          const cellText = String(row.cells[ci] ?? "").trim();
          // 匹配标签：忽略末尾冒号
          if (!cellText) continue;
          const cellClean = cellText.replace(/[：:]\s*$/, "");
          if (cellClean === entry.label) {
            // 取右边第一个非空列的值
            const val = String(row.cells[ci + 1] ?? "").trim();
            if (val) result[entry.toField] = val;
            break; // 匹配到一个标签就跳出内层循环
          }
        }
      }
    }
  }
  return result;
}

// 在单行中扫描标签，从当前行和相邻行提取 KV 对（返回提取到的值）
function scanKvOnRow(row: RawRow, entries: KvEntry[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of entries) {
    for (let ci = 0; ci < row.cells.length; ci++) {
      const cellText = String(row.cells[ci] ?? "").trim();
      if (!cellText) continue;
      const cellClean = cellText.replace(/[：:]\s*$/, "");
      if (cellClean === entry.label) {
        const val = String(row.cells[ci + 1] ?? "").trim();
        if (val) result[entry.toField] = val;
        break;
      }
    }
  }
  return result;
}

// ====== 数据区列映射 ======
function applyFieldMappings(row: RawRow, mappings: FieldMapping[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const m of mappings) {
    const val = String(row.cells[m.fromCol] ?? "").trim();
    record[m.toField] = val;
  }
  return record;
}

// ====== 主解析函数 ======
export function parseFile(file: ParsedFile, rule: ParseRule): OrderRow[] {
  if (file.sheets && file.sheets.length > 1) {
    // 多 Sheet 合并模式
    return parseMultiSheet(file, rule);
  }

  return parseRows(file.rows, rule, 0);
}

// ====== 标准模式（含 aggregate/matrix/card） ======
function parseRows(rows: RawRow[], rule: ParseRule, rowIndexOffset: number): OrderRow[] {
  const total = rows.length;
  if (total === 0) return [];

  const mode = rule.parseMode;
  const excel = rule.excel;

  if (mode === "matrix") return parseMatrix(rows, rule, rowIndexOffset);
  if (mode === "card") return parseCards(rows, rule, rowIndexOffset);
  if (mode === "aggregate") return parseAggregate(rows, rule, rowIndexOffset);

  // ----- standard mode -----
  const dataStartRow = excel?.dataStartRow ?? 0;
  const footerRows = excel?.footerRows ?? 0;
  const headerRows = excel?.headerRows ?? 0;
  const skipIfFirstCol = excel?.skipIfFirstColContains ?? [];
  const skipRows = new Set(excel?.skipRows?.map((r) => r - 1) ?? []);

  const result: OrderRow[] = [];
  let rowIdx = 0;

  // 提取 KV 对（头部或尾部元信息）
  const kvValues = extractKvPairs(rows, rule.kvExtract, dataStartRow, total);

  for (let i = dataStartRow; i < total - footerRows; i++) {
    if (skipRows.has(i)) continue;

    const row = rows[i];
    const firstCell = String(row.cells[0] ?? "").trim();
    if (!firstCell) continue;
    if (skipIfFirstCol.some((s) => firstCell.includes(s))) continue;

    const record = applyFieldMappings(row, rule.fieldMappings);

    result.push({
      id: crypto.randomUUID(),
      rowIndex: rowIndexOffset + rowIdx,
      externalCode: record["externalCode"] || rule.defaults?.["externalCode"] || kvValues["externalCode"] || "",
      storeName: record["storeName"] || kvValues["storeName"] || rule.defaults?.["storeName"] || "",
      receiverName: record["receiverName"] || kvValues["receiverName"] || rule.defaults?.["receiverName"] || "",
      receiverPhone: record["receiverPhone"] || kvValues["receiverPhone"] || rule.defaults?.["receiverPhone"] || "",
      receiverAddress: record["receiverAddress"] || kvValues["receiverAddress"] || rule.defaults?.["receiverAddress"] || "",
      skuCode: record["skuCode"] || "",
      skuName: record["skuName"] || "",
      skuQuantity: Number(record["skuQuantity"]) || 0,
      skuSpec: record["skuSpec"] || "",
      remark: record["remark"] || "",
    });
    rowIdx++;
  }

  return result;
}

// ====== 矩阵转置模式 ======
function parseMatrix(rows: RawRow[], rule: ParseRule, rowIndexOffset: number): OrderRow[] {
  const matrix = rule.matrix;
  if (!matrix) return [];

  const storeHeaderRow = matrix.storeHeaderRow;
  const storeStartCol = matrix.storeStartCol;
  const storeEndCol = matrix.storeEndCol;

  // 提取门店名（从表头行）
  const headerRow = rows[storeHeaderRow];
  const storeNames: { col: number; name: string }[] = [];
  for (let ci = storeStartCol; ci <= storeEndCol; ci++) {
    const name = String(headerRow?.cells[ci] ?? "").trim();
    storeNames.push({ col: ci, name });
  }

  const result: OrderRow[] = [];
  const kvValues = extractKvPairs(rows, rule.kvExtract, 0, rows.length);

  for (let ri = storeHeaderRow + 1; ri < rows.length; ri++) {
    const row = rows[ri];
    const firstCell = String(row.cells[0] ?? "").trim();
    if (!firstCell) continue;

    // 提取 SKU 信息
    const skuRecord = applyFieldMappings(row, matrix.fixedColMappings);

    for (const { col, name } of storeNames) {
      const qty = Number(row.cells[col]) || 0;
      if (qty <= 0) continue;  // 数量为0的不生成记录

      result.push({
        id: crypto.randomUUID(),
        rowIndex: rowIndexOffset + result.length,
        externalCode: kvValues["externalCode"] || "",
        storeName: name,
        receiverName: kvValues["receiverName"] || "",
        receiverPhone: kvValues["receiverPhone"] || "",
        receiverAddress: kvValues["receiverAddress"] || "",
        skuCode: skuRecord["skuCode"] || "",
        skuName: skuRecord["skuName"] || "",
        skuQuantity: qty,
        skuSpec: skuRecord["skuSpec"] || "",
        remark: skuRecord["remark"] || "",
      });
    }
  }

  return result;
}

// ====== 跨行聚合模式 ======
function parseAggregate(rows: RawRow[], rule: ParseRule, rowIndexOffset: number): OrderRow[] {
  const agg = rule.aggregate;
  if (!agg) return parseRows(rows, rule, rowIndexOffset);

  const excel = rule.excel;
  const dataStartRow = excel?.dataStartRow ?? 0;
  const footerRows = excel?.footerRows ?? 0;
  const skipIfFirstCol = excel?.skipIfFirstColContains ?? [];

  const result: OrderRow[] = [];

  for (let i = dataStartRow; i < rows.length - footerRows; i++) {
    const row = rows[i];
    const firstCell = String(row.cells[0] ?? "").trim();
    if (!firstCell) continue;
    if (skipIfFirstCol.some((s) => firstCell.includes(s))) continue;

    const record = applyFieldMappings(row, rule.fieldMappings);

    result.push({
      id: crypto.randomUUID(),
      rowIndex: rowIndexOffset + result.length,
      externalCode: record["externalCode"] || rule.defaults?.["externalCode"] || "",
      storeName: record["storeName"] || rule.defaults?.["storeName"] || "",
      receiverName: record["receiverName"] || rule.defaults?.["receiverName"] || "",
      receiverPhone: record["receiverPhone"] || rule.defaults?.["receiverPhone"] || "",
      receiverAddress: record["receiverAddress"] || rule.defaults?.["receiverAddress"] || "",
      skuCode: record["skuCode"] || "",
      skuName: record["skuName"] || "",
      skuQuantity: Number(record["skuQuantity"]) || 0,
      skuSpec: record["skuSpec"] || "",
      remark: record["remark"] || "",
    });
  }

  return result;
}

// ====== 卡片识别模式 ======
function parseCards(rows: RawRow[], rule: ParseRule, rowIndexOffset: number): OrderRow[] {
  const card = rule.card;
  if (!card) return [];

  const boundaryRe = new RegExp(card.boundaryPattern);
  const result: OrderRow[] = [];
  let currentMeta: Record<string, string> = {};

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const firstCell = String(row.cells[0] ?? "");
    const rowText = row.cells.map((c) => String(c ?? "")).join(" ");

    // 检测卡片边界
    if (boundaryRe.test(firstCell) || boundaryRe.test(rowText)) {
      currentMeta = {}; // 重置
    }

    // 扫描当前行是否有 KV 标签
    const kvFound = scanKvOnRow(row, card.cardMetaMappings);
    if (Object.keys(kvFound).length > 0) {
      Object.assign(currentMeta, kvFound);
    }

    // 尝试按 dataFieldMappings 提取数据行
    const dataRecord = applyFieldMappings(row, card.dataFieldMappings);
    if (dataRecord["skuCode"] || dataRecord["skuName"]) {
      result.push({
        id: crypto.randomUUID(),
        rowIndex: rowIndexOffset + result.length,
        externalCode: currentMeta["externalCode"] || "",
        storeName: currentMeta["storeName"] || "",
        receiverName: currentMeta["receiverName"] || "",
        receiverPhone: currentMeta["receiverPhone"] || "",
        receiverAddress: currentMeta["receiverAddress"] || "",
        skuCode: dataRecord["skuCode"] || "",
        skuName: dataRecord["skuName"] || "",
        skuQuantity: Number(dataRecord["skuQuantity"]) || 0,
        skuSpec: dataRecord["skuSpec"] || "",
        remark: dataRecord["remark"] || "",
      });
    }
  }

  return result;
}

// ====== 多 Sheet 合并模式 ======
function parseMultiSheet(file: ParsedFile, rule: ParseRule): OrderRow[] {
  const all: OrderRow[] = [];
  let offset = 0;

  for (const sheet of file.sheets ?? []) {
    const sheetRows = parseRows(sheet.rows, rule, offset);
    all.push(...sheetRows);
    offset += sheet.rows.length;
  }

  return all;
}
