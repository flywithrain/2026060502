"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Save, Download, Plus, Trash2, Loader2, AlertCircle,
  CheckCircle, Upload, FileSpreadsheet
} from "lucide-react";
import { useToast } from "@/components/shared/toast";
import { ProgressBar } from "@/components/shared/progress-bar";
import { EmptyState } from "@/components/shared/empty-state";
import { validateOrders, checkExternalCodeDuplicates } from "@/lib/validators";
import { submitOrders, getExistingExternalCodes } from "@/lib/server-actions";
import { generateId } from "@/lib/utils";
import * as XLSX from "xlsx";
import type { OrderRow, ValidationError, SubmitResult } from "@/types";

interface ColumnDef {
  key: keyof OrderRow;
  label: string;
  width: number;
  required?: boolean;
}

const COLUMNS: ColumnDef[] = [
  { key: "rowIndex", label: "#", width: 50 },
  { key: "externalCode", label: "外部编码", width: 140 },
  { key: "storeName", label: "收货门店", width: 160 },
  { key: "receiverName", label: "收件人姓名", width: 120 },
  { key: "receiverPhone", label: "收件人电话", width: 130 },
  { key: "receiverAddress", label: "收件人地址", width: 200 },
  { key: "skuCode", label: "SKU物品编码", width: 130, required: true },
  { key: "skuName", label: "SKU物品名称", width: 180, required: true },
  { key: "skuQuantity", label: "SKU发货数量", width: 110, required: true },
  { key: "skuSpec", label: "SKU规格型号", width: 150 },
  { key: "remark", label: "备注", width: 150 },
];

export default function PreviewPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [rows, setRows] = useState<OrderRow[]>([]);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [fileName, setFileName] = useState("");
  const [ruleName, setRuleName] = useState("");
  const [parseDuration, setParseDuration] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [editCell, setEditCell] = useState<{ row: number; col: keyof OrderRow } | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("previewData");
    if (!stored) {
      router.replace("/");
      return;
    }
    const data = JSON.parse(stored);
    setRows(data.rows || []);
    setErrors(data.errors || []);
    setFileName(data.fileName || "");
    setRuleName(data.ruleName || "");
    setParseDuration(data.parseDuration || 0);
  }, [router]);

  // Revalidate on data change
  useEffect(() => {
    if (rows.length > 0) {
      const newErrors = validateOrders(rows);
      getExistingExternalCodes().then((existingCodes) => {
        const dupErrors = checkExternalCodeDuplicates(rows, existingCodes);
        setErrors([...newErrors, ...dupErrors]);
      }).catch(() => {
        setErrors(newErrors);
      });
    }
  }, [rows]);

  const getFieldErrors = useCallback(
    (rowIndex: number, field: string) =>
      errors.filter((e) => e.rowIndex === rowIndex && e.field === field),
    [errors]
  );

  const updateCell = useCallback(
    (rowIndex: number, field: keyof OrderRow, value: string) => {
      setRows((prev) =>
        prev.map((row) => {
          if (row.rowIndex !== rowIndex) return row;
          const updated = { ...row } as Record<string, unknown>;
          if (field === "skuQuantity") {
            updated[field] = Number(value) || 0;
          } else {
            updated[field] = value;
          }
          return updated as unknown as OrderRow;
        })
      );
    },
    []
  );

  const handleCellClick = useCallback((rowIndex: number, colKey: keyof OrderRow) => {
    if (colKey === "rowIndex") return;
    setEditCell({ row: rowIndex, col: colKey });
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const handleCellBlur = useCallback(() => {
    setEditCell(null);
  }, []);

  const handleCellKeyDown = useCallback(
    (e: React.KeyboardEvent, rowIndex: number, colKey: keyof OrderRow) => {
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const colIdx = COLUMNS.findIndex((c) => c.key === colKey);
        const nextColIdx = colIdx + (e.key === "Tab" && e.shiftKey ? -1 : 1);
        const nextCol = COLUMNS[nextColIdx];
        if (nextCol && nextCol.key !== "rowIndex") {
          setEditCell({ row: rowIndex, col: nextCol.key });
          setTimeout(() => inputRef.current?.focus(), 0);
        } else if (e.key === "Enter") {
          setEditCell({ row: rowIndex + 1, col: colKey });
          setTimeout(() => inputRef.current?.focus(), 0);
        } else {
          setEditCell(null);
        }
      }
      if (e.key === "Escape") {
        setEditCell(null);
      }
    },
    []
  );

  const handleDeleteRow = useCallback((rowIndex: number) => {
    setRows((prev) => prev.filter((r) => r.rowIndex !== rowIndex));
  }, []);

  const handleAddRow = useCallback(() => {
    const maxIdx = rows.reduce((max, r) => Math.max(max, r.rowIndex), -1);
    const newRow: OrderRow = {
      id: generateId(),
      rowIndex: maxIdx + 1,
      externalCode: "",
      storeName: "",
      receiverName: "",
      receiverPhone: "",
      receiverAddress: "",
      skuCode: "",
      skuName: "",
      skuQuantity: 0,
      skuSpec: "",
      remark: "",
    };
    setRows((prev) => [...prev, newRow]);
  }, [rows]);

  const handleExport = useCallback(() => {
    const exportData = rows.map((row) => {
      const result: Record<string, unknown> = {};
      for (const col of COLUMNS) {
        if (col.key === "rowIndex") continue;
        result[col.label] = row[col.key] as unknown;
      }
      return result;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "出库单");
    XLSX.writeFile(wb, `出库单_${fileName || "export"}.xlsx`);
    showToast("导出成功", "success");
  }, [rows, fileName, showToast]);

  const handleSubmit = useCallback(async () => {
    const validationErrors = validateOrders(rows);
    if (validationErrors.length > 0) {
      showToast(`存在 ${validationErrors.length} 个校验错误，请修正后重试`, "error");
      return;
    }

    setSubmitting(true);
    const batchId = generateId();
    const { success, failed } = await submitOrders(
      rows.map((r) => ({
        externalCode: r.externalCode,
        storeName: r.storeName,
        receiverName: r.receiverName,
        receiverPhone: r.receiverPhone,
        receiverAddress: r.receiverAddress,
        skuCode: r.skuCode,
        skuName: r.skuName,
        skuQuantity: Number(r.skuQuantity),
        skuSpec: r.skuSpec,
        remark: r.remark,
      })),
      batchId
    );

    setSubmitting(false);
    setSubmitResult({ success, failed, batchId });
    showToast(`提交完成：成功 ${success} 条，失败 ${failed} 条`, "success");
  }, [rows, showToast]);

  const totalErrors = errors.filter(
    (e, i, arr) => arr.findIndex((x) => x.rowIndex === e.rowIndex) === i
  ).length;

  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <EmptyState
          title="暂无待预览数据"
          description="请返回首页上传文件并进行解析"
          action={
            <button onClick={() => router.push("/")} className="btn-primary gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              返回首页
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-full px-4 py-8">
      {/* 顶部信息栏 */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <button onClick={() => router.push("/")} className="btn-ghost mb-2 gap-1">
            <ArrowLeft className="h-4 w-4" />
            返回
          </button>
          <h1 className="text-xl font-bold text-[#1d2129]">数据预览与编辑</h1>
          <p className="text-xs text-[#86909c]">
            文件：{fileName} | 规则：{ruleName} | 解析耗时：{parseDuration}ms | 共 {rows.length} 条记录
            {totalErrors > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-[#cf1322]">
                <AlertCircle className="h-3 w-3" />
                {errors.length} 处错误
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleAddRow} className="btn-outline gap-1 text-sm">
            <Plus className="h-4 w-4" />
            新增行
          </button>
          <button onClick={handleExport} className="btn-outline gap-1 text-sm">
            <Download className="h-4 w-4" />
            导出Excel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || totalErrors > 0}
            className="btn-primary gap-1.5 text-sm"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                提交中...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                提交下单
              </>
            )}
          </button>
        </div>
      </div>

      {/* 提交结果 */}
      {submitResult && (
        <div className={`alert mb-4 ${submitResult.failed > 0 ? "alert-warning" : "alert-success"}`}>
          <CheckCircle className="inline-block h-4 w-4" />
          <span className="ml-2">
            提交完成：成功 <strong>{submitResult.success}</strong> 条
            {submitResult.failed > 0 && (
              <>，失败 <strong>{submitResult.failed}</strong> 条</>
            )}
          </span>
        </div>
      )}

      {/* 错误汇总 */}
      {errors.length > 0 && (
        <div className="alert alert-danger mb-4">
          <AlertCircle className="inline-block h-4 w-4" />
          <strong className="ml-1">共 {errors.length} 个校验错误：</strong>
          <ul className="mt-1 ml-6 list-disc text-xs">
            {errors.slice(0, 10).map((err, i) => (
              <li key={i}>
                第 {err.rowIndex + 1} 行 - {err.field}：{err.message}
              </li>
            ))}
            {errors.length > 10 && <li>...还有 {errors.length - 10} 个错误</li>}
          </ul>
        </div>
      )}

      {/* 数据表格 */}
      <div className="card overflow-hidden !p-0">
        <div ref={tableRef} className="table-wrapper max-h-[65vh]">
          <table className="table-styled" style={{ minWidth: COLUMNS.reduce((s, c) => s + c.width, 0) }}>
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th key={col.key} style={{ width: col.width, minWidth: col.width }}>
                    {col.label}
                    {col.required && <span className="ml-1 text-[#cf1322]">*</span>}
                  </th>
                ))}
                <th style={{ width: 60, minWidth: 60 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const hasRowError = errors.some((e) => e.rowIndex === row.rowIndex);
                return (
                  <tr
                    key={row.id || row.rowIndex}
                    style={{
                      background: hasRowError ? "#fff1f0" : undefined,
                    }}
                  >
                    {COLUMNS.map((col) => {
                      const fieldErrors = getFieldErrors(row.rowIndex, col.key);
                      const hasError = fieldErrors.length > 0;
                      const isEditing =
                        editCell?.row === row.rowIndex && editCell?.col === col.key;
                      const value =
                        col.key === "rowIndex"
                          ? row.rowIndex + 1
                          : row[col.key as keyof OrderRow];

                      return (
                        <td
                          key={col.key}
                          style={{
                            width: col.width,
                            minWidth: col.width,
                            borderColor: hasError ? "#ffccc7" : undefined,
                            background: hasError ? "#fff1f0" : undefined,
                          }}
                          onClick={() => handleCellClick(row.rowIndex, col.key)}
                          className="relative cursor-text"
                        >
                          {isEditing ? (
                            <input
                              ref={inputRef}
                              className="input-field !border-[#0fc6c2] !shadow-[0_0_0_2px_rgba(15,198,194,0.15)]"
                              value={String(value ?? "")}
                              onChange={(e) =>
                                updateCell(row.rowIndex, col.key, e.target.value)
                              }
                              onBlur={handleCellBlur}
                              onKeyDown={(e) =>
                                handleCellKeyDown(e, row.rowIndex, col.key)
                              }
                              type={col.key === "skuQuantity" ? "number" : "text"}
                              min={col.key === "skuQuantity" ? 1 : undefined}
                            />
                          ) : (
                            <div className="truncate text-xs" title={hasError ? fieldErrors[0]?.message : String(value ?? "")}>
                              {String(value ?? "")}
                            </div>
                          )}
                          {hasError && (
                            <div
                              className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#cf1322] text-white text-[10px]"
                              title={fieldErrors.map((e) => e.message).join("; ")}
                            >
                              !
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td style={{ width: 60, minWidth: 60, textAlign: "center" }}>
                      <button
                        onClick={() => handleDeleteRow(row.rowIndex)}
                        className="btn-ghost p-1 text-xs text-[#cf1322]"
                        title="删除行"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 数据统计 */}
      <div className="mt-4 flex items-center gap-4 text-xs text-[#86909c]">
        <span>总计 {rows.length} 行</span>
        <span className="text-[#cf1322]">错误行 {totalErrors}</span>
        <span className="text-[#17c964]">无错误行 {rows.length - totalErrors}</span>
      </div>
    </div>
  );
}
