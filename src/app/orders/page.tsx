"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { getOrdersPage } from "@/lib/server-actions";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import type { DbOrder } from "@/types";

export default function OrdersPage() {
  const [orders, setOrders] = useState<DbOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const pageSize = 20;
  const totalPages = Math.ceil(total / pageSize);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    const { rows, total: t } = await getOrdersPage(
      page,
      pageSize,
      search || undefined,
      receiverName || undefined,
      startDate || undefined,
      endDate || undefined
    );
    setOrders(rows as unknown as DbOrder[]);
    setTotal(t);
    setLoading(false);
  }, [page, search, receiverName, startDate, endDate]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleSearch = useCallback(() => {
    setPage(1);
    loadOrders();
  }, [loadOrders]);

  const formatDate = (d?: string | Date) => {
    if (!d) return "-";
    return new Date(d).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1d2129]">已导入运单列表</h1>
        <p className="mt-1 text-sm text-[#86909c]">查看所有历史导入的运单记录</p>
      </div>

      {/* 筛选栏 */}
      <div className="card mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="mb-1 block text-xs font-medium text-[#86909c]">外部编码</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#86909c]" />
              <input
                className="input-field pl-8 text-sm"
                placeholder="搜索外部编码..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="mb-1 block text-xs font-medium text-[#86909c]">收件人姓名</label>
            <input
              className="input-field text-sm"
              placeholder="搜索收件人..."
              value={receiverName}
              onChange={(e) => setReceiverName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>
          <div className="w-[160px]">
            <label className="mb-1 block text-xs font-medium text-[#86909c]">提交开始</label>
            <input
              type="date"
              className="input-field text-sm"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="w-[160px]">
            <label className="mb-1 block text-xs font-medium text-[#86909c]">提交结束</label>
            <input
              type="date"
              className="input-field text-sm"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <button onClick={handleSearch} className="btn-primary h-[38px] text-sm">
            搜索
          </button>
        </div>
      </div>

      {/* 数据表格 */}
      {loading ? (
        <div className="card py-12 text-center text-sm text-[#86909c]">加载中...</div>
      ) : orders.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-16 w-16 opacity-30" />}
          title="暂无运单数据"
          description="上传文件解析并提交下单后，数据将显示在此处"
        />
      ) : (
        <>
          <div className="card overflow-hidden !p-0">
            <div className="table-wrapper max-h-[60vh]">
              <table className="table-styled">
                <thead>
                  <tr>
                    <th>外部编码</th>
                    <th>收货门店</th>
                    <th>收件人</th>
                    <th>电话</th>
                    <th>地址</th>
                    <th>SKU编码</th>
                    <th>SKU名称</th>
                    <th>数量</th>
                    <th>规格</th>
                    <th>备注</th>
                    <th>提交时间</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td className="text-xs whitespace-nowrap">{order.externalCode || "-"}</td>
                      <td className="text-xs whitespace-nowrap">{order.storeName || "-"}</td>
                      <td className="text-xs">{order.receiverName || "-"}</td>
                      <td className="text-xs whitespace-nowrap">{order.receiverPhone || "-"}</td>
                      <td className="text-xs max-w-[180px] truncate" title={order.receiverAddress || ""}>
                        {order.receiverAddress || "-"}
                      </td>
                      <td className="text-xs whitespace-nowrap font-mono">{order.skuCode}</td>
                      <td className="text-xs">{order.skuName}</td>
                      <td className="text-xs text-center">{order.skuQuantity}</td>
                      <td className="text-xs">{order.skuSpec || "-"}</td>
                      <td className="text-xs">{order.remark || "-"}</td>
                      <td className="text-xs whitespace-nowrap">{formatDate(order.submittedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 分页 */}
          <div className="mt-4 flex items-center justify-between text-sm text-[#86909c]">
            <span>共 {total} 条记录，第 {page}/{totalPages} 页</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn-ghost p-1.5"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const p = i + Math.max(1, page - 2);
                if (p > totalPages) return null;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded text-xs font-medium",
                      p === page
                        ? "bg-[#0fc6c2] text-white"
                        : "hover:bg-[#f0f0f0] text-[#4e5969]"
                    )}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="btn-ghost p-1.5"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
