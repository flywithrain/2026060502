import type { ParseRuleDraft, AiRuleResponse, RawRow } from "@/types";

const SYSTEM_PROMPT = `你是一个物流发货单解析专家。你需要分析文件结构并生成解析规则JSON。

请根据提供的文件结构样本（前N行数据），分析并返回以下格式的JSON规则：

\`\`\`json
{
  "rule": {
    "name": "规则名称",
    "description": "规则描述",
    "fileType": "excel|pdf",
    "parseMode": "standard|aggregate|matrix|card|multi-sheet",
    "excel": {
      "headerRows": 0,
      "footerRows": 0,
      "dataStartRow": 1,
      "skipRows": [],
      "skipIfFirstColContains": ["合计", "总计"]
    },
    "pdf": {
      "tableStartMarker": "",
      "tableEndMarker": "",
      "footerStartMarker": ""
    },
    "fieldMappings": [
      {"fromCol": 1, "toField": "externalCode", "aiConfidence": "high"},
      {"fromCol": 2, "toField": "skuName", "aiConfidence": "high"}
    ],
    "aggregate": {
      "groupByCol": 1,
      "groupByField": "externalCode",
      "sharedFields": ["storeName", "receiverName", "receiverPhone", "receiverAddress"]
    },
    "matrix": {
      "storeHeaderRow": 1,
      "storeStartCol": 3,
      "storeEndCol": 10,
      "fixedColMappings": []
    },
    "card": {
      "boundaryPattern": "pattern",
      "headerRowMappings": [],
      "dataHeaderRowOffset": 0,
      "dataFieldMappings": []
    },
    "footerExtract": {
      "extractFromEnd": true,
      "rowMappings": []
    },
    "defaults": {}
  },
  "suggestions": "分析说明文字",
  "confidenceSummary": {"high": 0, "medium": 0, "low": 0}
}
\`\`\`

重要规则：
1. 字段映射toField必须是：externalCode, storeName, receiverName, receiverPhone, receiverAddress, skuCode, skuName, skuQuantity, skuSpec, remark
2. 分析文件时注意：头部干扰行、尾部散落的收货信息、合并单元格、跨行聚合、矩阵结构、卡片边界
3. aiConfidence标记：high(明确匹配)、medium(推测)、low(不确定)
4. 各parseMode适用场景：
   - standard: 标准表格，行列对应
   - aggregate: 同一编号下多行，需要按组聚合共享字段
   - matrix: 横向展开的门店×SKU矩阵
   - card: 卡片式布局，有明确边界标记
   - multi-sheet: 多个Sheet，每个Sheet独立
5. footerExtract的rowOffset为从文件末尾倒数的偏移量（如果extractFromEnd为true）
6. 请仔细检查，确保所有字段映射正确`;

function buildSamplePrompt(rows: RawRow[], fileType: string, fileName: string): string {
  const maxSampleRows = Math.min(rows.length, 50);
  const sample = rows.slice(0, maxSampleRows)
    .map((r) => `Row ${r.rowNum}: ${JSON.stringify(r.cells.filter((c) => c !== null && c !== ""))}`)
    .join("\n");

  // 也显示最后几行（用于尾部信息分析）
  const tailSample = rows.slice(-10)
    .map((r) => `Row ${r.rowNum}: ${JSON.stringify(r.cells.filter((c) => c !== null && c !== ""))}`)
    .join("\n");

  return `文件名：${fileName}
文件类型：${fileType}
总行数：${rows.length}

=== 前${maxSampleRows}行样本 ===
${sample}

=== 最后10行（尾部信息） ===
${tailSample}

请分析以上文件结构并生成解析规则。`;
}

export async function generateRule(
  rows: RawRow[],
  fileType: string,
  fileName: string
): Promise<AiRuleResponse> {
  const apiUrl = process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/v1/chat/completions";
  const apiKey = process.env.DEEPSEEK_API_KEY || "";

  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY 环境变量未配置");
  }

  const samplePrompt = buildSamplePrompt(rows, fileType, fileName);

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: samplePrompt },
      ],
      temperature: 0.1,
      max_tokens: 4096,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("AI API error:", errText);
    throw new Error(`AI API 调用失败: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("AI 返回内容为空");
  }

  const parsed: AiRuleResponse = JSON.parse(content);
  return parsed;
}
