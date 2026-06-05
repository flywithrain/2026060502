import type { ParsedFile, ParseRule, OrderRow, RawRow } from "@/types";
import { generateId } from "./utils";

type Mutable<T> = T & Record<string, unknown>;

export function parseFile(parsedFile: ParsedFile, rule: ParseRule): OrderRow[] {
  const { fileType } = parsedFile;

  if (fileType === "excel") {
    switch (rule.parseMode) {
      case "standard": return parseStandard(parsedFile, rule);
      case "aggregate": return parseAggregate(parsedFile, rule);
      case "matrix": return parseMatrix(parsedFile, rule);
      case "card": return parseCard(parsedFile, rule);
      case "multi-sheet": return parseMultiSheet(parsedFile, rule);
      default: return parseStandard(parsedFile, rule);
    }
  }
  if (fileType === "pdf") {
    return parsePdfStandard(parsedFile, rule);
  }
  return [];
}

function setField<T extends object>(obj: T, field: string, val: unknown): void {
  (obj as unknown as Record<string, unknown>)[field] = val;
}

function getField(obj: unknown, field: string): unknown {
  return (obj as Record<string, unknown>)[field];
}

function applyFieldMappings(
  cells: (string | number | null)[],
  mappings: ParseRule["fieldMappings"],
  item: Partial<OrderRow>
) {
  for (const mapping of mappings) {
    const val = cells[mapping.fromCol - 1];
    if (val !== null && val !== undefined && val !== "") {
      const field = mapping.toField;
      if (field === "skuQuantity") {
        setField(item, field, Number(val));
      } else {
        setField(item, field, String(val));
      }
    }
  }
}

function applyDefaults(item: Partial<OrderRow>, defaults?: ParseRule["defaults"]) {
  if (!defaults) return;
  for (const [key, val] of Object.entries(defaults)) {
    if (!getField(item, key)) {
      setField(item, key, val);
    }
  }
}

function makeOrder(rowIndex: number, overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: generateId(), rowIndex,
    externalCode: "", storeName: "", receiverName: "", receiverPhone: "",
    receiverAddress: "", skuCode: "", skuName: "", skuQuantity: 0,
    skuSpec: "", remark: "", ...overrides,
  };
}

// ====== 模式 1: 标准解析 ======
function parseStandard(parsedFile: ParsedFile, rule: ParseRule): OrderRow[] {
  const rows = parsedFile.rows;
  const excel = rule.excel;
  const startRow = excel ? excel.dataStartRow - 1 : 0;
  const endRow = excel ? rows.length - excel.footerRows : rows.length;
  const skip = new Set((excel?.skipRows || []).map((r) => r - 1));

  const orders: OrderRow[] = [];
  let rowIdx = 0;

  for (let i = startRow; i < endRow; i++) {
    if (skip.has(i)) continue;
    const cells = rows[i]?.cells || [];
    const firstCell = cells[0]?.toString().trim() || "";
    if (excel?.skipIfFirstColContains?.some((m) => firstCell.includes(m))) continue;
    if (excel?.endMarker) {
      const markerVal = cells[excel.endMarker.col - 1]?.toString().trim() || "";
      if (markerVal.includes(excel.endMarker.val)) break;
    }
    const item = makeOrder(rowIdx);
    applyFieldMappings(cells, rule.fieldMappings, item);
    applyDefaults(item, rule.defaults);
    if (item.skuCode || item.skuName) {
      orders.push(item);
      rowIdx++;
    }
  }

  if (rule.footerExtract?.rowMappings) {
    applyFooterExtract(rows, rows.length, rule, orders);
  }
  return orders;
}

function applyFooterExtract(rows: RawRow[], totalRows: number, rule: ParseRule, orders: OrderRow[]) {
  if (!rule.footerExtract) return;
  for (const rowMapping of rule.footerExtract.rowMappings) {
    let targetRow: RawRow | undefined;
    if (rule.footerExtract.extractFromEnd) {
      targetRow = rows[totalRows + rowMapping.rowOffset];
    } else {
      targetRow = rows[rowMapping.rowOffset];
    }
    if (targetRow?.cells) {
      for (const order of orders) {
        applyFieldMappings(targetRow.cells, rowMapping.mappings, order);
      }
    }
  }
}

// ====== 模式 2: 跨行聚合 ======
function parseAggregate(parsedFile: ParsedFile, rule: ParseRule): OrderRow[] {
  const rows = parsedFile.rows;
  const excel = rule.excel;
  const startRow = excel ? excel.dataStartRow - 1 : 0;
  const endRow = excel ? rows.length - excel.footerRows : rows.length;
  const skip = new Set((excel?.skipRows || []).map((r) => r - 1));

  const groups = new Map<string, RawRow[]>();
  for (let i = startRow; i < endRow; i++) {
    if (skip.has(i)) continue;
    const cells = rows[i]?.cells || [];
    const firstCell = cells[0]?.toString().trim() || "";
    if (excel?.skipIfFirstColContains?.some((m) => firstCell.includes(m))) continue;
    const groupKeyIdx = (rule.aggregate?.groupByCol || 1) - 1;
    const groupKey = cells[groupKeyIdx]?.toString().trim() || "";
    if (!groupKey) continue;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey)!.push(rows[i]);
  }

  const orders: OrderRow[] = [];
  let rowIdx = 0;
  const sharedFields = new Set(rule.aggregate?.sharedFields || []);

  for (const [, groupRows] of groups) {
    const firstRowCells = groupRows[0]?.cells || [];
    const shared: Partial<OrderRow> = {};
    for (const mapping of rule.fieldMappings) {
      const val = firstRowCells[mapping.fromCol - 1];
      if (val !== null && val !== undefined && val !== "" && sharedFields.has(mapping.toField)) {
        setField(shared, mapping.toField, String(val));
      }
    }
    for (const rawRow of groupRows) {
      const cells = rawRow.cells;
      const item = makeOrder(rowIdx, shared as Partial<OrderRow>);
      for (const mapping of rule.fieldMappings) {
        const val = cells[mapping.fromCol - 1];
        if (val !== null && val !== undefined && val !== "") {
          const field = mapping.toField;
          if (field === "skuQuantity") setField(item, field, Number(val));
          else setField(item, field, String(val));
        }
      }
      applyDefaults(item, rule.defaults);
      if (item.skuCode || item.skuName) {
        orders.push(item);
        rowIdx++;
      }
    }
  }
  return orders;
}

// ====== 模式 3: 矩阵转置 ======
function parseMatrix(parsedFile: ParsedFile, rule: ParseRule): OrderRow[] {
  if (!rule.matrix) return [];
  const rows = parsedFile.rows;
  const m = rule.matrix;
  const headerRow = rows[m.storeHeaderRow - 1];
  if (!headerRow) return [];

  const startRow = rule.excel ? rule.excel.dataStartRow - 1 : m.storeHeaderRow;
  const endRow = rule.excel ? rows.length - rule.excel.footerRows : rows.length;
  const orders: OrderRow[] = [];
  let rowIdx = 0;

  for (let col = m.storeStartCol; col <= m.storeEndCol; col++) {
    const storeName = headerRow.cells[col - 1]?.toString().trim();
    if (!storeName) continue;
    for (let i = startRow; i < endRow; i++) {
      const cells = rows[i]?.cells || [];
      const qtyVal = cells[col - 1];
      const qty = qtyVal !== null && qtyVal !== undefined ? Number(qtyVal) : 0;
      if (!qty || isNaN(qty)) continue;
      const item = makeOrder(rowIdx, { storeName, skuQuantity: qty });
      for (const mapping of m.fixedColMappings) {
        const val = cells[mapping.fromCol - 1];
        if (val !== null && val !== undefined && val !== "") {
          const field = mapping.toField;
          if (field === "skuQuantity") setField(item, field, Number(val));
          else setField(item, field, String(val));
        }
      }
      applyDefaults(item, rule.defaults);
      if (item.skuCode || item.skuName) {
        orders.push(item);
        rowIdx++;
      }
    }
  }
  return orders;
}

// ====== 模式 4: 卡片式解析 ======
function parseCard(parsedFile: ParsedFile, rule: ParseRule): OrderRow[] {
  if (!rule.card) return [];
  const rows = parsedFile.rows;
  const card = rule.card;
  const pattern = new RegExp(card.boundaryPattern);

  const cards: { startRow: number; endRow: number }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const val = rows[i]?.cells[0]?.toString().trim() || "";
    if (pattern.test(val)) {
      cards.push({ startRow: i, endRow: rows.length });
      if (cards.length > 1) cards[cards.length - 2].endRow = i - 1;
    }
  }

  const orders: OrderRow[] = [];
  let rowIdx = 0;

  for (const cardRange of cards) {
    const headerInfo: Partial<OrderRow> = {};
    for (const hm of card.headerRowMappings) {
      const targetRowIdx = cardRange.startRow + hm.rowOffset;
      const targetRow = rows[Math.min(targetRowIdx, cardRange.endRow)];
      if (targetRow?.cells) {
        applyFieldMappings(targetRow.cells, hm.mappings, headerInfo);
      }
    }
    const dataStart = cardRange.startRow + card.dataHeaderRowOffset + 1;
    for (let i = dataStart; i <= cardRange.endRow; i++) {
      const cells = rows[i]?.cells || [];
      const item = makeOrder(rowIdx, headerInfo as Partial<OrderRow>);
      applyFieldMappings(cells, card.dataFieldMappings, item);
      applyDefaults(item, rule.defaults);
      if (item.skuCode || item.skuName) {
        orders.push(item);
        rowIdx++;
      }
    }
  }
  return orders;
}

// ====== 模式 5: 多Sheet合并 ======
function parseMultiSheet(parsedFile: ParsedFile, rule: ParseRule): OrderRow[] {
  const allOrders: OrderRow[] = [];
  const sheets = parsedFile.sheets || [];
  for (const sheet of sheets) {
    const subFile: ParsedFile = { ...parsedFile, rows: sheet.rows };
    const subRule = { ...rule, parseMode: "standard" as const };
    const orders = parseStandard(subFile, subRule);
    allOrders.push(...orders);
  }
  allOrders.forEach((o, i) => { o.rowIndex = i; });
  return allOrders;
}

// ====== 模式 6: PDF文本解析 ======
function parsePdfStandard(parsedFile: ParsedFile, rule: ParseRule): OrderRow[] {
  const text = parsedFile.sampleText || parsedFile.rows.map((r) => r.cells[0] || "").join("\n");
  const lines = text.split("\n").filter(Boolean);
  const pdf = rule.pdf;
  if (!pdf) return [];

  let inTable = false;
  const orders: OrderRow[] = [];
  let rowIdx = 0;
  let currentItem: Partial<OrderRow> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.includes(pdf.tableStartMarker)) { inTable = true; continue; }
    if (pdf.tableEndMarker && trimmed.includes(pdf.tableEndMarker)) { inTable = false; continue; }
    if (pdf.footerStartMarker && trimmed.includes(pdf.footerStartMarker)) {
      for (const order of orders) extractPdfFooterInfo(trimmed, order);
      continue;
    }
    if (inTable) {
      const cells = trimmed.split(/\s{2,}|\t/);
      const item = makeOrder(rowIdx);
      applyFieldMappings(cells, rule.fieldMappings, item);
      applyDefaults(item, rule.defaults);
      if (item.skuCode || item.skuName) {
        Object.assign(item, currentItem);
        orders.push(item);
        rowIdx++;
      }
    } else {
      extractPdfFooterInfo(trimmed, currentItem as OrderRow);
    }
  }
  return orders;
}

function extractPdfFooterInfo(line: string, item: Partial<OrderRow>) {
  const patterns: [RegExp, keyof OrderRow][] = [
    [/收货人[：:]?\s*(\S+)/, "receiverName"],
    [/电话[：:]?\s*(\d[\d-]*)/, "receiverPhone"],
    [/地址[：:]?\s*(.+)/, "receiverAddress"],
    [/门店[：:]?\s*(.+)/, "storeName"],
  ];
  for (const [regex, field] of patterns) {
    const match = line.match(regex);
    if (match) setField(item, field, match[1].trim());
  }
}
