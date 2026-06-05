import type { ParseRuleDraft, AiRuleResponse, RawRow } from "@/types";

const SYSTEM_PROMPT = `你是一个物流发货单解析专家。你需要分析文件结构并生成解析规则JSON。

请根据提供的文件结构样本（前N行数据），直接返回纯 JSON 对象（不要用 \`\`\`json 包裹，不要任何额外文字），格式如下：

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
      "cardMetaMappings": [],
      "dataFieldMappings": []
    },
    "kvExtract": [
      {
        "rows": [-1],
        "entries": [
          {"label": "收货人", "toField": "receiverName"}
        ]
      }
    ],
    "defaults": {}
  },
  "suggestions": "分析说明文字",
  "confidenceSummary": {"high": 0, "medium": 0, "low": 0}
}

重要规则：
1. 字段映射toField必须是：externalCode, storeName, receiverName, receiverPhone, receiverAddress, skuCode, skuName, skuQuantity, skuSpec, remark
2. 分析文件时注意：头部干扰行、尾部散落的收货信息、合并单元格、跨行聚合、矩阵结构、卡片边界
3. aiConfidence标记：high(明确匹配)、medium(推测)、low(不确定)
4. 各parseMode适用场景：
   - standard: 标准表格，行列对应（用excel.dataStartRow跳过非数据行，用fieldMappings映射列→字段）
   - aggregate: 同一编号下多行，需要按组聚合共享字段
   - matrix: 横向展开的门店×SKU矩阵（用fixedColMappings映射SKU信息列，门槛名从表头行的storeStartCol到storeEndCol读取）
   - card: 卡片式布局，有明确边界标记（cardMetaMappings扫描每行KV标签提取门店/收货人，dataFieldMappings映射卡片内物品表）
   - multi-sheet: 多个Sheet，每个Sheet独立
5. kvExtract配置用于提取非表格结构的K-V对（如底部"收货人：张三"这类信息）：
   - rows: 行偏移数组，正数从dataStartRow起，负数从文件末尾倒数
   - entries: 每项包含 label(标签文字) 和 toField(目标字段)
6. 请仔细检查，确保所有字段映射正确
7. ⚠️ 直接返回纯 JSON，不要加任何前缀或后缀文字`;

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
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY 环境变量未配置");
  }

  const samplePrompt = buildSamplePrompt(rows, fileType, fileName);

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: samplePrompt },
    ],
    temperature: 0.1,
    max_completion_tokens: 4096,
    thinking: { type: "disabled" },
  };

  // 仅 deepseek 官方 API 需要 response_format，Mimo 等兼容 API 可能不支持
  if (apiUrl.includes("deepseek.com")) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("AI API error:", errText);
    throw new Error(`AI API 调用失败: ${response.status}`);
  }

  const data = await response.json();
  console.log("[Mimo API] full response keys:", Object.keys(data));
  console.log("[Mimo API] usage:", JSON.stringify(data.usage));
  console.log("[Mimo API] choices[0]:", JSON.stringify(data.choices?.[0]));

  const message = data.choices?.[0]?.message;
  // Mimo 深度思考模式下内容可能在 reasoning_content，用 content 兜底
  const content = message?.content || message?.reasoning_content;

  if (!content) {
    console.error("[Mimo API] 完整响应:", JSON.stringify(data).slice(0, 2000));
    throw new Error("AI 返回内容为空（请检查模型名、API Key 是否正确）");
  }

  // 提取 JSON：兼容 markdown 代码块包裹、纯文本前缀等格式
  const parsed = extractJson<AiRuleResponse>(content);
  return parsed;
}

/** 从 AI 返回文本中提取 JSON（兼容 ```json 包裹、前导文本、尾部文本） */
function extractJson<T>(raw: string): T {
  // 优先匹配 ```json ... ``` 包裹的内容
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1].trim() : raw.trim();

  try {
    return JSON.parse(candidate) as T;
  } catch {
    // 如果候选文本仍然无效，尝试从 { 开始截取到最后一个 }
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const slice = candidate.slice(firstBrace, lastBrace + 1);
      return JSON.parse(slice) as T;
    }
    console.error("AI 返回内容无法解析为 JSON，原文:", raw);
    throw new Error("AI 返回格式异常，无法解析为 JSON");
  }
}
