"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Save, Play, ArrowLeft, Loader2, AlertCircle, CheckCircle, HelpCircle, FileUp, PenLine } from "lucide-react";
import { useToast } from "@/components/shared/toast";
import { parseFile } from "@/lib/parse-engine";
import { readFile } from "@/lib/file-reader";
import { saveRule } from "@/lib/server-actions";
import type { ParseRuleDraft, AiRuleResponse, RawRow, OrderRow, FieldMapping } from "@/types";

// ----- 规则编辑器组件（新建/编辑共用） -----
function RuleEditor({
  rule,
  onChange,
  onAddMapping,
  onUpdateMapping,
  onRemoveMapping,
  aiResponse,
  fileRows,
  fileName,
}: {
  rule: ParseRuleDraft;
  onChange: (key: keyof ParseRuleDraft, value: unknown) => void;
  onAddMapping: () => void;
  onUpdateMapping: (index: number, field: keyof FieldMapping, value: unknown) => void;
  onRemoveMapping: (index: number) => void;
  aiResponse: AiRuleResponse | null;
  fileRows: RawRow[];
  fileName: string;
}) {
  const handleTestParse = useCallback(() => {
    const rows = parseFile(
      { fileName, fileType: rule.fileType as "excel" | "pdf", rows: fileRows },
      rule as never
    );
    // 把结果暂存到 sessionStorage 供预览查看
    sessionStorage.setItem("ruleTestPreview", JSON.stringify(rows.slice(0, 20)));
    sessionStorage.setItem("ruleTestFileName", fileName);
    window.open("/preview", "_blank");
  }, [rule, fileRows, fileName]);

  const availableFields = [
    { key: "externalCode", label: "外部编码" },
    { key: "storeName", label: "收货门店" },
    { key: "receiverName", label: "收件人姓名" },
    { key: "receiverPhone", label: "收件人电话" },
    { key: "receiverAddress", label: "收件人地址" },
    { key: "skuCode", label: "SKU物品编码" },
    { key: "skuName", label: "SKU物品名称" },
    { key: "skuQuantity", label: "SKU发货数量" },
    { key: "skuSpec", label: "SKU规格型号" },
    { key: "remark", label: "备注" },
  ];

  const confidenceColors: Record<string, string> = {
    high: "tag-green",
    medium: "tag-orange",
    low: "tag-red",
  };

  return (
    <div className="space-y-4">
      {/* 基本信息 */}
      <div className="card">
        <h3 className="mb-3 text-base font-semibold">规则基本信息</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[#4e5969]">规则名称</label>
            <input
              className="input-field"
              value={rule.name}
              onChange={(e) => onChange("name", e.target.value)}
              placeholder="例如：海口龙湖天街配送单"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[#4e5969]">解析模式</label>
            <select
              className="input-field"
              value={rule.parseMode}
              onChange={(e) => onChange("parseMode", e.target.value)}
            >
              <option value="standard">标准表格</option>
              <option value="aggregate">跨行聚合</option>
              <option value="matrix">矩阵转置</option>
              <option value="card">卡片识别</option>
              <option value="multi-sheet">多Sheet合并</option>
            </select>
          </div>
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-sm font-medium text-[#4e5969]">文件类型</label>
          <select
            className="input-field w-48"
            value={rule.fileType}
            onChange={(e) => onChange("fileType", e.target.value)}
          >
            <option value="excel">Excel (.xlsx/.xls)</option>
            <option value="pdf">PDF</option>
          </select>
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-sm font-medium text-[#4e5969]">规则描述</label>
          <input
            className="input-field"
            value={rule.description}
            onChange={(e) => onChange("description", e.target.value)}
            placeholder="描述此规则的适用场景..."
          />
        </div>
      </div>

      {/* 字段映射 */}
      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">字段映射配置</h3>
          <button onClick={onAddMapping} className="btn-outline gap-1 text-xs">
            + 添加映射
          </button>
        </div>
        <div className="table-wrapper">
          <table className="table-styled">
            <thead>
              <tr>
                <th style={{ width: 80 }}>来源列号</th>
                <th>目标字段</th>
                <th style={{ width: 100 }}>AI置信度</th>
                <th style={{ width: 60 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rule.fieldMappings.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-sm text-[#86909c]">
                    暂无映射，点击"+ 添加映射"添加
                  </td>
                </tr>
              ) : (
                rule.fieldMappings.map((mapping, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        type="number"
                        className="input-field w-16 text-center"
                        value={mapping.fromCol}
                        onChange={(e) => onUpdateMapping(i, "fromCol", Number(e.target.value))}
                        min={1}
                      />
                    </td>
                    <td>
                      <select
                        className="input-field"
                        value={mapping.toField}
                        onChange={(e) => onUpdateMapping(i, "toField", e.target.value)}
                      >
                        {availableFields.map((f) => (
                          <option key={f.key} value={f.key}>{f.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="text-center">
                      {mapping.aiConfidence && (
                        <span className={`tag ${confidenceColors[mapping.aiConfidence] || ""}`}>
                          {mapping.aiConfidence === "high" ? (
                            <CheckCircle className="mr-1 inline-block h-3 w-3" />
                          ) : mapping.aiConfidence === "medium" ? (
                            <AlertCircle className="mr-1 inline-block h-3 w-3" />
                          ) : (
                            <HelpCircle className="mr-1 inline-block h-3 w-3" />
                          )}
                          {mapping.aiConfidence}
                        </span>
                      )}
                    </td>
                    <td>
                      <button onClick={() => onRemoveMapping(i)} className="btn-ghost text-xs text-[#cf1322]">
                        删除
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI分析结果摘要 */}
      {aiResponse && (
        <div className="card">
          <h3 className="mb-2 text-base font-semibold">AI分析说明</h3>
          <p className="text-sm text-[#4e5969] whitespace-pre-wrap">{aiResponse.suggestions}</p>
          <div className="mt-2 flex gap-2">
            <span className="tag tag-green">高置信度: {aiResponse.confidenceSummary.high}</span>
            <span className="tag tag-orange">中置信度: {aiResponse.confidenceSummary.medium}</span>
            <span className="tag tag-red">低置信度: {aiResponse.confidenceSummary.low}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ====== 新建规则页面 ======
export default function NewRulePage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [step, setStep] = useState<"choose" | "file" | "ai" | "edit">("choose");
  const [rule, setRule] = useState<ParseRuleDraft>({
    name: "",
    description: "",
    fileType: "excel",
    parseMode: "standard",
    fieldMappings: [],
    defaults: {},
  });
  const [aiResponse, setAiResponse] = useState<AiRuleResponse | null>(null);
  const [fileRows, setFileRows] = useState<RawRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 从 sessionStorage 恢复文件数据（从首页上传跳转来的，60秒内有效）
  useEffect(() => {
    const stored = sessionStorage.getItem("newRuleFile");
    if (!stored) return;

    const data = JSON.parse(stored);
    sessionStorage.removeItem("newRuleFile"); // 立即清除，避免残留

    // 超过 60 秒 或 无时间戳（旧格式）视为过期，忽略
    if (!data._timestamp || Date.now() - data._timestamp > 60_000) return;

    setFileName(data.fileName);
    setFileRows(data.rows || []);
    setRule((prev) => ({
      ...prev,
      fileType: data.fileType || "excel",
      name: `解析规则 - ${data.fileName}`,
    }));
    setStep("ai");
  }, []);

  const handleAiGenerate = useCallback(async () => {
    setAiLoading(true);
    const res = await fetch("/api/ai/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: fileRows,
        fileType: rule.fileType,
        fileName: fileName,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.error || "AI分析失败", "error");
      setAiLoading(false);
      return;
    }

    const result: AiRuleResponse = await res.json();
    setAiResponse(result);
    setRule(result.rule);
    setStep("edit");
    setAiLoading(false);
    showToast("AI规则生成完成，请确认和微调", "success");
  }, [fileRows, fileName, rule.fileType, showToast]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const parsed = await readFile(file);
    setFileName(parsed.fileName);
    setFileRows(parsed.rows);
    setRule((prev) => ({
      ...prev,
      fileType: parsed.fileType,
      name: `解析规则 - ${parsed.fileName}`,
    }));
    setStep("ai");
  }, []);

  const handleSkipAi = useCallback(() => {
    setStep("edit");
  }, []);

  const handleManualCreate = useCallback(() => {
    setStep("edit");
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const id = await saveRule(rule);
    setSaving(false);
    showToast(`规则已保存 (ID: ${id.slice(0, 8)})`, "success");
    router.push("/rules");
  }, [rule, router, showToast]);

  const updateField = useCallback((key: keyof ParseRuleDraft, value: unknown) => {
    setRule((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateMapping = useCallback((index: number, field: keyof FieldMapping, value: unknown) => {
    setRule((prev) => {
      const mappings = [...prev.fieldMappings];
      mappings[index] = { ...mappings[index], [field]: value };
      return { ...prev, fieldMappings: mappings };
    });
  }, []);

  const addMapping = useCallback(() => {
    setRule((prev) => ({
      ...prev,
      fieldMappings: [
        ...prev.fieldMappings,
        { fromCol: prev.fieldMappings.length + 1, toField: "skuName" as never, aiConfidence: "low" as const },
      ],
    }));
  }, []);

  const removeMapping = useCallback((index: number) => {
    setRule((prev) => ({
      ...prev,
      fieldMappings: prev.fieldMappings.filter((_, i) => i !== index),
    }));
  }, []);

  // 步骤标签
  const stepLabels = ["选择方式", "上传文件", "AI分析", "编辑规则"];
  const steps = step === "edit" ? ["choose", "edit"] : ["choose", "file", "ai", "edit"].slice(0, step === "choose" ? 1 : step === "file" ? 2 : step === "ai" ? 3 : 4);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <button onClick={() => router.back()} className="btn-ghost mb-4 gap-1">
        <ArrowLeft className="h-4 w-4" />
        返回
      </button>

      <h1 className="text-2xl font-bold text-[#1d2129]">新建解析规则</h1>
      <p className="mt-1 text-sm text-[#86909c]">上传文件由 AI 自动生成，或手动配置字段映射</p>

      {/* 步骤指示器 */}
      <div className="mt-6 flex items-center gap-2">
        {stepLabels.map((label, i) => {
          const stepKey = ["choose", "file", "ai", "edit"][i];
          const idx = ["choose", "file", "ai", "edit"].indexOf(step);
          const isActive = i <= idx || step === "edit";
          const isCurrent = (step === "edit" && i === 3) || stepKey === step;
          return (
            <div key={stepKey} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                  isCurrent
                    ? "bg-[#0fc6c2] text-white"
                    : isActive
                    ? "bg-[#e8fafa] text-[#0fc6c2]"
                    : "bg-[#f0f0f0] text-[#86909c]"
                }`}
              >
                {i + 1}
              </div>
              <span className="text-xs text-[#86909c]">{label}</span>
              {i < 3 && <div className="h-px w-8 bg-[#e5e6eb]" />}
            </div>
          );
        })}
      </div>

      {/* Step 1: 选择创建方式 */}
      {step === "choose" && (
        <div className="mt-6 grid grid-cols-2 gap-4">
          <button onClick={() => setStep("file")} className="card hover:border-[#0fc6c2] transition-colors text-left">
            <FileUp className="h-10 w-10 text-[#0fc6c2] opacity-70" />
            <h3 className="mt-3 text-base font-semibold text-[#1d2129]">上传文件 → AI 分析</h3>
            <p className="mt-1 text-sm text-[#86909c]">上传 Excel/PDF 出库单，AI 自动识别结构并生成解析规则</p>
          </button>
          <button onClick={handleManualCreate} className="card hover:border-[#0fc6c2] transition-colors text-left">
            <PenLine className="h-10 w-10 text-[#0fc6c2] opacity-70" />
            <h3 className="mt-3 text-base font-semibold text-[#1d2129]">手动创建规则</h3>
            <p className="mt-1 text-sm text-[#86909c]">自行配置字段映射、解析模式等参数，无需上传文件</p>
          </button>
        </div>
      )}

      {/* Step 2: 上传文件 */}
      {step === "file" && (
        <div className="card mt-6">
          <label className="drop-zone block cursor-pointer">
            <input type="file" accept=".xlsx,.xls,.pdf" onChange={handleFileUpload} className="hidden" />
            <Sparkles className="mx-auto h-12 w-12 text-[#0fc6c2] opacity-60" />
            <p className="mt-3 text-base font-medium">点击上传文件，让 AI 分析结构</p>
            <p className="mt-1 text-sm text-[#86909c]">支持 Excel / PDF 格式</p>
          </label>
          <div className="mt-4 pt-4 border-t border-[#e5e6eb]">
            <button onClick={handleSkipAi} className="btn-outline gap-1 text-sm">
              <PenLine className="h-4 w-4" />
              跳过 AI，手动配置
            </button>
          </div>
        </div>
      )}

      {/* Step 3: AI分析 */}
      {step === "ai" && (
        <div className="card mt-6">
          <div className="alert alert-info mb-4">
            <AlertCircle className="inline-block h-4 w-4" />
            <span className="ml-2 text-sm">
              文件已就绪：{fileName}（{fileRows.length} 行），点击下方按钮让 AI 分析文件结构并自动生成解析规则。
            </span>
          </div>

          {aiLoading ? (
            <div className="py-8 text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#0fc6c2]" />
              <p className="mt-3 text-sm text-[#86909c]">AI 正在分析文件结构，请稍候...</p>
            </div>
          ) : (
            <div className="space-y-4 text-center">
              <button onClick={handleAiGenerate} className="btn-primary gap-2 text-base px-8 py-3">
                <Sparkles className="h-5 w-5" />
                AI 分析并生成规则
              </button>
              <div>
                <button onClick={handleSkipAi} className="btn-ghost gap-1 text-sm">
                  <PenLine className="h-4 w-4" />
                  跳过 AI，手动配置
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 4: 编辑规则 */}
      {step === "edit" && (
        <div className="mt-6">
          <RuleEditor
            rule={rule}
            onChange={updateField}
            onAddMapping={addMapping}
            onUpdateMapping={updateMapping}
            onRemoveMapping={removeMapping}
            aiResponse={aiResponse}
            fileRows={fileRows}
            fileName={fileName}
          />

          <div className="mt-4 flex gap-3">
            <button onClick={handleSave} disabled={saving} className="btn-primary gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "保存中..." : "保存规则"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
