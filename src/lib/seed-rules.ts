"use server";

import { db } from "@/lib/db";
import { parseRules } from "@/lib/db-schema";
import { eq } from "drizzle-orm";
import { generateId } from "@/lib/utils";

const DEMO_RULES = [
  {
    name: "海口龙湖天街配送发货单",
    description: "42列标准表格，前3行干扰头部，第4行表头，底部收货人信息散落在末尾",
    config: {
      name: "海口龙湖天街配送发货单",
      description: "42列标准表格，前3行干扰头部，第4行表头，底部收货人信息散落在末尾",
      fileType: "excel",
      parseMode: "standard",
      excel: {
        headerRows: 3,
        footerRows: 2,
        dataStartRow: 5,
        skipRows: [7],
        skipIfFirstColContains: ["合计"],
      },
      fieldMappings: [
        { fromCol: 1, toField: "skuCode", aiConfidence: "high" },
        { fromCol: 4, toField: "skuName", aiConfidence: "high" },
        { fromCol: 6, toField: "skuSpec", aiConfidence: "medium" },
        { fromCol: 15, toField: "skuQuantity", aiConfidence: "high" },
        { fromCol: 42, toField: "remark", aiConfidence: "low" },
      ],
      footerExtract: {
        extractFromEnd: true,
        rowMappings: [
          {
            rowOffset: -1,
            mappings: [
              { fromCol: 2, toField: "receiverName", aiConfidence: "high" },
              { fromCol: 5, toField: "receiverPhone", aiConfidence: "high" },
              { fromCol: 14, toField: "receiverAddress", aiConfidence: "high" },
            ],
          },
        ],
      },
      defaults: {
        externalCode: "PS2512220005001",
      },
    },
  },
  {
    name: "湖南仓发货明细",
    description: "32列，第1行说明，第2行表头，按配送单号跨行聚合",
    config: {
      name: "湖南仓发货明细",
      description: "32列，第1行说明，第2行表头，按配送单号跨行聚合",
      fileType: "excel",
      parseMode: "aggregate",
      excel: {
        headerRows: 1,
        footerRows: 0,
        dataStartRow: 3,
      },
      fieldMappings: [
        { fromCol: 1, toField: "storeName", aiConfidence: "high" },
        { fromCol: 2, toField: "externalCode", aiConfidence: "high" },
        { fromCol: 5, toField: "skuCode", aiConfidence: "high" },
        { fromCol: 6, toField: "skuName", aiConfidence: "high" },
        { fromCol: 8, toField: "skuSpec", aiConfidence: "high" },
        { fromCol: 12, toField: "skuQuantity", aiConfidence: "high" },
        { fromCol: 28, toField: "receiverName", aiConfidence: "high" },
        { fromCol: 29, toField: "receiverPhone", aiConfidence: "high" },
        { fromCol: 30, toField: "receiverAddress", aiConfidence: "high" },
      ],
      aggregate: {
        groupByCol: 2,
        groupByField: "externalCode",
        sharedFields: [
          "storeName",
          "receiverName",
          "receiverPhone",
          "receiverAddress",
          "externalCode",
        ],
      },
    },
  },
  {
    name: "欢乐牧场模板(矩阵)",
    description: "SKU×门店矩阵，门店作为列头横向排列，需要转置",
    config: {
      name: "欢乐牧场模板(矩阵)",
      description: "SKU×门店矩阵，门店作为列头横向排列，需要转置",
      fileType: "excel",
      parseMode: "matrix",
      excel: {
        headerRows: 0,
        footerRows: 0,
        dataStartRow: 2,
      },
      fieldMappings: [],
      matrix: {
        storeHeaderRow: 1,
        storeStartCol: 14,
        storeEndCol: 18,
        fixedColMappings: [
          { fromCol: 3, toField: "skuName", aiConfidence: "high" },
          { fromCol: 4, toField: "skuCode", aiConfidence: "high" },
          { fromCol: 8, toField: "skuSpec", aiConfidence: "medium" },
        ],
      },
    },
  },
  {
    name: "PDF配送单",
    description: "PDF格式，头部元信息+标准表格+底部收货签字区",
    config: {
      name: "PDF配送单",
      description: "PDF格式，头部元信息+标准表格+底部收货签字区",
      fileType: "pdf",
      parseMode: "standard",
      pdf: {
        tableStartMarker: "物品编码",
        tableEndMarker: "合计",
        footerStartMarker: "收货人",
      },
      fieldMappings: [
        { fromCol: 1, toField: "skuCode", aiConfidence: "high" },
        { fromCol: 2, toField: "skuName", aiConfidence: "high" },
        { fromCol: 3, toField: "skuQuantity", aiConfidence: "high" },
        { fromCol: 4, toField: "skuSpec", aiConfidence: "medium" },
      ],
    },
  },
  {
    name: "多门店分Sheet出库单",
    description: "3个Sheet，每个Sheet是独立门店出库单，底部横向收货人信息",
    config: {
      name: "多门店分Sheet出库单",
      description: "3个Sheet，每个Sheet是独立门店出库单，底部横向收货人信息",
      fileType: "excel",
      parseMode: "multi-sheet",
      excel: {
        headerRows: 3,
        footerRows: 4,
        dataStartRow: 4,
        skipRows: [12],
        skipIfFirstColContains: ["合计"],
      },
      fieldMappings: [
        { fromCol: 2, toField: "skuCode", aiConfidence: "high" },
        { fromCol: 3, toField: "skuName", aiConfidence: "high" },
        { fromCol: 4, toField: "skuSpec", aiConfidence: "medium" },
        { fromCol: 6, toField: "skuQuantity", aiConfidence: "high" },
        { fromCol: 8, toField: "remark", aiConfidence: "low" },
      ],
      footerExtract: {
        extractFromEnd: true,
        rowMappings: [
          {
            rowOffset: -2,
            mappings: [
              { fromCol: 4, toField: "receiverName", aiConfidence: "high" },
              { fromCol: 8, toField: "receiverPhone", aiConfidence: "medium" },
            ],
          },
        ],
      },
    },
  },
  {
    name: "卡片式调拨单",
    description: "非标准表格，卡片式布局，▶ 调拨记录 #N 作为边界标记",
    config: {
      name: "卡片式调拨单",
      description: "非标准表格，卡片式布局，▶ 调拨记录 #N 作为边界标记",
      fileType: "excel",
      parseMode: "card",
      card: {
        boundaryPattern: "▶.*调拨记录",
        headerRowMappings: [
          {
            rowOffset: 1,
            mappings: [
              { fromCol: 2, toField: "storeName", aiConfidence: "high" },
              { fromCol: 4, toField: "receiverName", aiConfidence: "high" },
              { fromCol: 6, toField: "receiverPhone", aiConfidence: "high" },
            ],
          },
          {
            rowOffset: 2,
            mappings: [
              { fromCol: 2, toField: "receiverAddress", aiConfidence: "high" },
            ],
          },
        ],
        dataHeaderRowOffset: 3,
        dataFieldMappings: [
          { fromCol: 1, toField: "skuCode", aiConfidence: "high" },
          { fromCol: 2, toField: "skuName", aiConfidence: "high" },
          { fromCol: 3, toField: "skuSpec", aiConfidence: "high" },
          { fromCol: 4, toField: "skuQuantity", aiConfidence: "high" },
        ],
      },
    },
  },
];

export async function seedDemoRules() {
  for (const rule of DEMO_RULES) {
    const configCopy = JSON.parse(JSON.stringify(rule.config));
    await db.insert(parseRules).values({
      id: generateId(),
      name: rule.name,
      description: rule.description,
      config: configCopy,
    });
  }
  return DEMO_RULES.length;
}
