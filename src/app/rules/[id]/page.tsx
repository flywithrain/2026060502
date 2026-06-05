"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Save, ArrowLeft, Loader2, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { useToast } from "@/components/shared/toast";
import { getRule, updateRule } from "@/lib/server-actions";
import type {
  ParseRuleDraft, FieldMapping, KvEntry, KvExtractConfig,
  ExcelConfig, MatrixConfig, CardConfig, AggregateConfig, PdfConfig,
} from "@/types";

// ---- 可用字段列表 ----
const TARGET_FIELDS = [
  "externalCode", "storeName", "receiverName", "receiverPhone",
  "receiverAddress", "skuCode", "skuName", "skuQuantity", "skuSpec", "remark",
];
const FIELD_LABELS: Record<string, string> = {
  externalCode: "外部编码", storeName: "收货门店", receiverName: "收件人姓名",
  receiverPhone: "收件人电话", receiverAddress: "收件人地址",
  skuCode: "SKU编码", skuName: "SKU名称", skuQuantity: "SKU发货数量",
  skuSpec: "SKU规格型号", remark: "备注",
};

// ---- 可折叠区块 ----
function Section({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between">
        <h3 className="text-base font-semibold">{title}</h3>
        {open ? <ChevronDown className="h-4 w-4 text-[#86909c]" /> : <ChevronRight className="h-4 w-4 text-[#86909c]" />}
      </button>
      {open && <div className="mt-4">{children}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[#86909c]">{label}</label>
      {children}
    </div>
  );
}

// ====== 主组件 ======
export default function EditRulePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rule, setRule] = useState<ParseRuleDraft>(() => ({
    name: "", description: "", fileType: "excel", parseMode: "standard",
    fieldMappings: [], defaults: {},
  }));

  // 加载已有规则
  useEffect(() => {
    getRule(id).then((data) => {
      if (data) {
        setRule({
          name: data.name || "",
          description: data.description || "",
          fileType: data.fileType || "excel",
          parseMode: data.parseMode || "standard",
          fieldMappings: Array.isArray(data.fieldMappings) ? data.fieldMappings : [],
          excel: data.excel || undefined,
          pdf: data.pdf || undefined,
          aggregate: data.aggregate || undefined,
          matrix: data.matrix || undefined,
          card: data.card || undefined,
          kvExtract: Array.isArray(data.kvExtract) ? data.kvExtract : undefined,
          defaults: data.defaults || {},
        });
      }
      setLoading(false);
    });
  }, [id]);

  // ---- 通用更新 ----
  const set = useCallback(<K extends keyof ParseRuleDraft>(key: K, val: ParseRuleDraft[K]) => {
    setRule((prev) => ({ ...prev, [key]: val }));
  }, []);

  // ---- 字段映射 ----
  const addMapping = useCallback(() => {
    setRule((prev) => ({
      ...prev,
      fieldMappings: [...prev.fieldMappings, { fromCol: 0, toField: "skuName", aiConfidence: "low" as const }],
    }));
  }, []);
  const updMapping = useCallback((i: number, f: keyof FieldMapping, v: unknown) => {
    setRule((prev) => {
      const m = [...prev.fieldMappings];
      m[i] = { ...m[i], [f]: v };
      return { ...prev, fieldMappings: m };
    });
  }, []);
  const delMapping = useCallback((i: number) => {
    setRule((prev) => ({ ...prev, fieldMappings: prev.fieldMappings.filter((_, j) => j !== i) }));
  }, []);

  // ---- Excel 配置 ----
  const safeExcel = rule.excel ?? ({} as Partial<ExcelConfig>);
  const updExcel = useCallback((k: keyof ExcelConfig, v: unknown) => {
    setRule((prev) => ({ ...prev, excel: { ...(prev.excel ?? {} as ExcelConfig), [k]: v } }));
  }, []);

  // ---- KV Extract ----
  const kvList = rule.kvExtract ?? [];
  const addKvGroup = useCallback(() => {
    setRule((prev) => ({ ...prev, kvExtract: [...(prev.kvExtract || []), { rows: [-1], entries: [] }] }));
  }, []);
  const updKvGroup = useCallback((gi: number, f: keyof KvExtractConfig, v: unknown) => {
    setRule((prev) => {
      const groups = [...(prev.kvExtract || [])];
      groups[gi] = { ...groups[gi], [f]: v };
      return { ...prev, kvExtract: groups };
    });
  }, []);
  const updKvRows = useCallback((gi: number, raw: string) => {
    const nums = raw.split(",").map((s) => parseInt(s.trim())).filter((n) => !isNaN(n));
    updKvGroup(gi, "rows", nums);
  }, [updKvGroup]);
  const addKvEntry = useCallback((gi: number) => {
    setRule((prev) => {
      const groups = [...(prev.kvExtract || [])];
      groups[gi] = { ...groups[gi], entries: [...groups[gi].entries, { label: "", toField: "receiverName" }] };
      return { ...prev, kvExtract: groups };
    });
  }, []);
  const updKvEntry = useCallback((gi: number, ei: number, f: keyof KvEntry, v: unknown) => {
    setRule((prev) => {
      const groups = [...(prev.kvExtract || [])];
      const entries = [...groups[gi].entries];
      entries[ei] = { ...entries[ei], [f]: v };
      groups[gi] = { ...groups[gi], entries };
      return { ...prev, kvExtract: groups };
    });
  }, []);
  const delKvEntry = useCallback((gi: number, ei: number) => {
    setRule((prev) => {
      const groups = [...(prev.kvExtract || [])];
      groups[gi] = { ...groups[gi], entries: groups[gi].entries.filter((_, j) => j !== ei) };
      return { ...prev, kvExtract: groups };
    });
  }, []);
  const delKvGroup = useCallback((gi: number) => {
    setRule((prev) => ({ ...prev, kvExtract: (prev.kvExtract || []).filter((_, i) => i !== gi) }));
  }, []);

  // ---- Matrix 配置 ----
  const safeMtx = (rule.matrix ?? {}) as Partial<MatrixConfig>;
  const updMtx = useCallback((k: keyof MatrixConfig, v: unknown) => {
    setRule((prev) => ({ ...prev, matrix: { ...(prev.matrix ?? {} as MatrixConfig), [k]: v } }));
  }, []);
  const mtxMappings = (safeMtx.fixedColMappings ?? []) as FieldMapping[];
  const addMtxMapping = useCallback(() => {
    setRule((prev) => ({
      ...prev,
      matrix: { ...(prev.matrix ?? {} as MatrixConfig), fixedColMappings: [...(prev.matrix?.fixedColMappings ?? []), { fromCol: 0, toField: "skuName", aiConfidence: "medium" }] },
    }));
  }, []);
  const updMtxMapping = useCallback((i: number, f: keyof FieldMapping, v: unknown) => {
    setRule((prev) => {
      const m = [...(prev.matrix?.fixedColMappings ?? [])];
      m[i] = { ...m[i], [f]: v };
      return { ...prev, matrix: { ...(prev.matrix ?? {} as MatrixConfig), fixedColMappings: m } };
    });
  }, []);

  // ---- Card 配置 ----
  const safeCard = (rule.card ?? {}) as Partial<CardConfig>;
  const updCard = useCallback((k: keyof CardConfig, v: unknown) => {
    setRule((prev) => ({ ...prev, card: { ...(prev.card ?? {} as CardConfig), [k]: v } }));
  }, []);
  const cardMeta = (safeCard.cardMetaMappings ?? []) as KvEntry[];
  const addCardMeta = useCallback(() => {
    setRule((prev) => ({
      ...prev, card: { ...(prev.card ?? {} as CardConfig), cardMetaMappings: [...(prev.card?.cardMetaMappings ?? []), { label: "", toField: "storeName" }] },
    }));
  }, []);
  const updCardMeta = useCallback((i: number, f: keyof KvEntry, v: unknown) => {
    setRule((prev) => {
      const m = [...(prev.card?.cardMetaMappings ?? [])];
      m[i] = { ...m[i], [f]: v };
      return { ...prev, card: { ...(prev.card ?? {} as CardConfig), cardMetaMappings: m } };
    });
  }, []);
  const cardDataMappings = (safeCard.dataFieldMappings ?? []) as FieldMapping[];
  const addCardDataMapping = useCallback(() => {
    setRule((prev) => ({
      ...prev, card: { ...(prev.card ?? {} as CardConfig), dataFieldMappings: [...(prev.card?.dataFieldMappings ?? []), { fromCol: 0, toField: "skuName", aiConfidence: "high" }] },
    }));
  }, []);
  const updCardDataMapping = useCallback((i: number, f: keyof FieldMapping, v: unknown) => {
    setRule((prev) => {
      const m = [...(prev.card?.dataFieldMappings ?? [])];
      m[i] = { ...m[i], [f]: v };
      return { ...prev, card: { ...(prev.card ?? {} as CardConfig), dataFieldMappings: m } };
    });
  }, []);

  // ---- Aggergate 配置 ----
  const safeAgg = (rule.aggregate ?? {}) as Partial<AggregateConfig>;
  const updAgg = useCallback((k: keyof AggregateConfig, v: unknown) => {
    setRule((prev) => ({
      ...prev, aggregate: { ...(prev.aggregate ?? {} as AggregateConfig), [k]: v },
    }));
  }, []);

  // ---- PDF 配置 ----
  const safePdf = (rule.pdf ?? {}) as Partial<PdfConfig>;
  const updPdf = useCallback((k: keyof PdfConfig, v: unknown) => {
    setRule((prev) => ({ ...prev, pdf: { ...(prev.pdf ?? {} as PdfConfig), [k]: v } }));
  }, []);

  // ---- 保存 ----
  const handleSave = useCallback(async () => {
    setSaving(true);
    await updateRule(id, rule);
    setSaving(false);
    showToast("规则已保存", "success");
    router.push("/rules");
  }, [id, rule, router, showToast]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-[#0fc6c2]" /><span className="ml-2 text-sm text-[#86909c]">加载规则...</span></div>;
  }

  const mode = rule.parseMode;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <button onClick={() => router.push("/rules")} className="btn-ghost mb-4 gap-1"><ArrowLeft className="h-4 w-4" />返回规则列表</button>
      <h1 className="text-2xl font-bold text-[#1d2129]">编辑解析规则</h1>
      <p className="mt-1 text-sm text-[#86909c]">修改所有规则配置参数</p>

      <div className="mt-6 space-y-4">
        {/* === 基本信息 === */}
        <Section title="规则基本信息">
          <div className="grid grid-cols-2 gap-4">
            <Field label="规则名称">
              <input className="input-field" value={rule.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="解析模式">
              <select className="input-field" value={mode} onChange={(e) => set("parseMode", e.target.value as typeof mode)}>
                <option value="standard">标准表格</option>
                <option value="aggregate">跨行聚合</option>
                <option value="matrix">矩阵转置</option>
                <option value="card">卡片识别</option>
                <option value="multi-sheet">多Sheet合并</option>
              </select>
            </Field>
            <Field label="文件类型">
              <select className="input-field" value={rule.fileType} onChange={(e) => set("fileType", e.target.value as typeof rule.fileType)}>
                <option value="excel">Excel</option>
                <option value="pdf">PDF</option>
              </select>
            </Field>
          </div>
          <div className="mt-3">
            <Field label="规则描述">
              <input className="input-field" value={rule.description} onChange={(e) => set("description", e.target.value)} placeholder="描述此规则的适用场景..." />
            </Field>
          </div>
        </Section>

        {/* === Excel 布局配置 === */}
        {(rule.fileType === "excel") && (
          <Section title="Excel 布局配置" defaultOpen>
            <div className="grid grid-cols-4 gap-3">
              <Field label="数据起始行(0-based)">
                <input type="number" className="input-field" value={safeExcel.dataStartRow ?? 0} onChange={(e) => updExcel("dataStartRow", Number(e.target.value))} min={0} />
              </Field>
              <Field label="跳过底部行数">
                <input type="number" className="input-field" value={safeExcel.footerRows ?? 0} onChange={(e) => updExcel("footerRows", Number(e.target.value))} min={0} />
              </Field>
              <Field label="跳过头部行数">
                <input type="number" className="input-field" value={safeExcel.headerRows ?? 0} onChange={(e) => updExcel("headerRows", Number(e.target.value))} min={0} />
              </Field>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="跳过行号(逗号分隔, 1-based)">
                <input className="input-field" value={(safeExcel.skipRows ?? []).join(", ")} onChange={(e) => updExcel("skipRows", e.target.value.split(",").map(Number).filter((n) => n > 0))} placeholder="如: 12" />
              </Field>
              <Field label="首列包含则跳过(逗号分隔)">
                <input className="input-field" value={(safeExcel.skipIfFirstColContains ?? []).join(", ")} onChange={(e) => updExcel("skipIfFirstColContains", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} placeholder="如: 合计, 总计" />
              </Field>
            </div>
          </Section>
        )}

        {/* === PDF 配置 === */}
        {rule.fileType === "pdf" && (
          <Section title="PDF 解析配置">
            <div className="grid grid-cols-2 gap-3">
              <Field label="表格起始标记"><input className="input-field" value={safePdf.tableStartMarker ?? ""} onChange={(e) => updPdf("tableStartMarker", e.target.value)} placeholder="如: 物品编码" /></Field>
              <Field label="表格结束标记"><input className="input-field" value={safePdf.tableEndMarker ?? ""} onChange={(e) => updPdf("tableEndMarker", e.target.value)} placeholder="如: 合计" /></Field>
            </div>
          </Section>
        )}

        {/* === 字段映射 === */}
        <Section title="字段映射（数据区列→字段）">
          <div className="mb-2"><button onClick={addMapping} className="btn-outline gap-1 text-xs"><Plus className="h-3 w-3" />添加映射</button></div>
          {rule.fieldMappings.length === 0 ? (
            <p className="py-4 text-center text-sm text-[#86909c]">暂无映射</p>
          ) : (
            <div className="table-wrapper">
              <table className="table-styled">
                <thead><tr><th style={{ width: 70 }}>列号</th><th>目标字段</th><th style={{ width: 50 }}></th></tr></thead>
                <tbody>
                  {rule.fieldMappings.map((m, i) => (
                    <tr key={i}>
                      <td><input type="number" className="input-field w-16 text-center" value={m.fromCol} onChange={(e) => updMapping(i, "fromCol", Number(e.target.value))} /></td>
                      <td>
                        <select className="input-field" value={m.toField} onChange={(e) => updMapping(i, "toField", e.target.value)}>
                          {TARGET_FIELDS.map((f) => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
                        </select>
                      </td>
                      <td><button onClick={() => delMapping(i)} className="btn-ghost text-xs text-[#cf1322]">删除</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* === KV 提取配置（所有模式通用） === */}
        <Section title="KV 对提取（头部/尾部标签→值映射）" defaultOpen={!!kvList.length}>
          <p className="mb-3 text-xs text-[#86909c]">用于从非表格行中提取键值对信息，如底部"收货人：张三"。rows正数从dataStartRow偏移，负数从末尾倒数。</p>
          {kvList.length === 0 ? (
            <p className="py-4 text-center text-sm text-[#86909c]">暂无KV提取配置</p>
          ) : (
            kvList.map((group, gi) => (
              <div key={gi} className="mb-4 rounded-lg border border-[#e5e6eb] p-3">
                <div className="mb-2 flex items-center gap-3">
                  <span className="text-xs font-medium text-[#4e5969]">区域 {gi + 1}</span>
                  <Field label="行偏移(逗号分隔)">
                    <input className="input-field w-40 text-xs" value={(group.rows ?? []).join(", ")} onChange={(e) => updKvRows(gi, e.target.value)} placeholder="-1" />
                  </Field>
                  <button onClick={() => delKvGroup(gi)} className="btn-ghost ml-auto text-xs text-[#cf1322]">删除区域</button>
                </div>
                <div className="table-wrapper">
                  <table className="table-styled text-xs">
                    <thead><tr><th style={{ width: 120 }}>标签文字</th><th>目标字段</th><th style={{ width: 50 }}></th></tr></thead>
                    <tbody>
                      {group.entries.map((entry, ei) => (
                        <tr key={ei}>
                          <td><input className="input-field text-xs" value={entry.label} onChange={(e) => updKvEntry(gi, ei, "label", e.target.value)} placeholder="如: 收货人" /></td>
                          <td>
                            <select className="input-field text-xs" value={entry.toField} onChange={(e) => updKvEntry(gi, ei, "toField", e.target.value)}>
                              {TARGET_FIELDS.map((f) => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
                            </select>
                          </td>
                          <td><button onClick={() => delKvEntry(gi, ei)} className="btn-ghost text-xs text-[#cf1322]">删除</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button onClick={() => addKvEntry(gi)} className="mt-2 btn-outline text-xs gap-1"><Plus className="h-3 w-3" />添加KV条目</button>
              </div>
            ))
          )}
          <button onClick={addKvGroup} className="btn-outline text-xs gap-1"><Plus className="h-3 w-3" />添加KV区域</button>
        </Section>

        {/* === 矩阵转置配置 === */}
        {mode === "matrix" && (
          <Section title="矩阵转置配置" defaultOpen>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <Field label="门店表头行(0-based)"><input type="number" className="input-field" value={safeMtx.storeHeaderRow ?? 0} onChange={(e) => updMtx("storeHeaderRow", Number(e.target.value))} /></Field>
              <Field label="门店起始列(0-based)"><input type="number" className="input-field" value={safeMtx.storeStartCol ?? 0} onChange={(e) => updMtx("storeStartCol", Number(e.target.value))} /></Field>
              <Field label="门店结束列(0-based)"><input type="number" className="input-field" value={safeMtx.storeEndCol ?? 0} onChange={(e) => updMtx("storeEndCol", Number(e.target.value))} /></Field>
            </div>
            <h4 className="mb-2 text-sm font-medium text-[#4e5969]">固定列映射（SKU信息列）</h4>
            <button onClick={addMtxMapping} className="btn-outline gap-1 text-xs mb-2"><Plus className="h-3 w-3" />添加</button>
            {mtxMappings.length === 0 ? <p className="py-3 text-center text-xs text-[#86909c]">暂无</p> : (
              <div className="table-wrapper"><table className="table-styled text-xs">
                <thead><tr><th style={{ width: 60 }}>列</th><th>字段</th><th style={{ width: 50 }}></th></tr></thead>
                <tbody>{mtxMappings.map((m, i) => (
                  <tr key={i}>
                    <td><input type="number" className="input-field w-14 text-center text-xs" value={m.fromCol} onChange={(e) => updMtxMapping(i, "fromCol", Number(e.target.value))} /></td>
                    <td><select className="input-field text-xs" value={m.toField} onChange={(e) => updMtxMapping(i, "toField", e.target.value)}>{TARGET_FIELDS.map((f) => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}</select></td>
                    <td><button onClick={() => { setRule((prev) => ({ ...prev, matrix: { ...(prev.matrix ?? {} as MatrixConfig), fixedColMappings: (prev.matrix?.fixedColMappings ?? []).filter((_, j) => j !== i) } })); }} className="btn-ghost text-xs text-[#cf1322]">删除</button></td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </Section>
        )}

        {/* === 卡片识别配置 === */}
        {mode === "card" && (
          <Section title="卡片识别配置" defaultOpen>
            <Field label="卡片边界正则">
              <input className="input-field" value={safeCard.boundaryPattern ?? ""} onChange={(e) => updCard("boundaryPattern", e.target.value)} placeholder="如: ▶.*调拨记录" />
            </Field>
            <div className="mt-4">
              <h4 className="mb-2 text-sm font-medium text-[#4e5969]">卡片元信息KV（调入门店/收货人等）</h4>
              <button onClick={addCardMeta} className="btn-outline gap-1 text-xs mb-2"><Plus className="h-3 w-3" />添加</button>
              {cardMeta.length === 0 ? <p className="py-3 text-center text-xs text-[#86909c]">暂无</p> : (
                <div className="table-wrapper"><table className="table-styled text-xs">
                  <thead><tr><th style={{ width: 120 }}>标签</th><th>字段</th><th style={{ width: 50 }}></th></tr></thead>
                  <tbody>{cardMeta.map((e, i) => (
                    <tr key={i}>
                      <td><input className="input-field text-xs" value={e.label} onChange={(v) => updCardMeta(i, "label", v.target.value)} /></td>
                      <td><select className="input-field text-xs" value={e.toField} onChange={(v) => updCardMeta(i, "toField", v.target.value)}>{TARGET_FIELDS.map((f) => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}</select></td>
                      <td><button onClick={() => { setRule((prev) => ({ ...prev, card: { ...(prev.card ?? {} as CardConfig), cardMetaMappings: (prev.card?.cardMetaMappings ?? []).filter((_, j) => j !== i) } })); }} className="btn-ghost text-xs text-[#cf1322]">删除</button></td>
                    </tr>
                  ))}</tbody>
                </table></div>
              )}
            </div>
            <div className="mt-4">
              <h4 className="mb-2 text-sm font-medium text-[#4e5969]">卡片内数据列映射</h4>
              <button onClick={addCardDataMapping} className="btn-outline gap-1 text-xs mb-2"><Plus className="h-3 w-3" />添加</button>
              {cardDataMappings.length === 0 ? <p className="py-3 text-center text-xs text-[#86909c]">暂无</p> : (
                <div className="table-wrapper"><table className="table-styled text-xs">
                  <thead><tr><th style={{ width: 60 }}>列</th><th>字段</th><th style={{ width: 50 }}></th></tr></thead>
                  <tbody>{cardDataMappings.map((m, i) => (
                    <tr key={i}>
                      <td><input type="number" className="input-field w-14 text-center text-xs" value={m.fromCol} onChange={(e) => updCardDataMapping(i, "fromCol", Number(e.target.value))} /></td>
                      <td><select className="input-field text-xs" value={m.toField} onChange={(e) => updCardDataMapping(i, "toField", e.target.value)}>{TARGET_FIELDS.map((f) => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}</select></td>
                      <td><button onClick={() => { setRule((prev) => ({ ...prev, card: { ...(prev.card ?? {} as CardConfig), dataFieldMappings: (prev.card?.dataFieldMappings ?? []).filter((_, j) => j !== i) } })); }} className="btn-ghost text-xs text-[#cf1322]">删除</button></td>
                    </tr>
                  ))}</tbody>
                </table></div>
              )}
            </div>
          </Section>
        )}

        {/* === 跨行聚合配置 === */}
        {mode === "aggregate" && (
          <Section title="跨行聚合配置" defaultOpen>
            <div className="grid grid-cols-2 gap-3">
              <Field label="聚合列(0-based)"><input type="number" className="input-field" value={safeAgg.groupByCol ?? 1} onChange={(e) => updAgg("groupByCol", Number(e.target.value))} /></Field>
              <Field label="聚合字段">
                <select className="input-field" value={safeAgg.groupByField ?? "externalCode"} onChange={(e) => updAgg("groupByField", e.target.value)}>
                  {TARGET_FIELDS.map((f) => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
                </select>
              </Field>
            </div>
          </Section>
        )}

        {/* === 操作按钮 === */}
        <div className="flex gap-3 pt-2">
          <button onClick={handleSave} disabled={saving} className="btn-primary gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "保存中..." : "保存修改"}
          </button>
          <button onClick={() => router.push("/rules")} className="btn-ghost gap-1">取消</button>
        </div>
      </div>
    </div>
  );
}
