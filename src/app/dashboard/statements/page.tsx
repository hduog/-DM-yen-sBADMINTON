"use client";

import { useEffect, useState } from "react";

type Statement = {
  _id: string;
  member_id: { _id: string; full_name: string } | null;
  month: string;
  total_sessions: number;
  total_amount: number;
  status: "pending" | "paid_reported" | "approved";
};

const STATUS_LABEL: Record<Statement["status"], string> = {
  pending: "Chưa thanh toán",
  paid_reported: "Chờ duyệt",
  approved: "Đã duyệt",
};

export default function StatementsPage() {
  const [statements, setStatements] = useState<Statement[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    fetch("/api/statements")
      .then((r) => r.json())
      .then(setStatements);
  }

  useEffect(load, []);

  async function handleApprove(id: string) {
    setBusyId(id);
    await fetch(`/api/statements/${id}/approve`, { method: "POST" });
    setBusyId(null);
    load();
  }

  return (
    <div className="flex flex-col gap-3">
      {statements === null && <p className="text-sm text-zinc-400">Đang tải...</p>}
      {statements?.length === 0 && (
        <p className="text-sm text-zinc-400">
          Chưa có sao kê nào. Sao kê được tự động tạo vào ngày chốt tháng đã cấu hình.
        </p>
      )}
      {statements?.map((s) => (
        <div key={s._id} className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4">
          <div>
            <p className="font-medium">{s.member_id?.full_name ?? "(đã xoá)"}</p>
            <p className="text-xs text-zinc-500">
              Tháng {s.month} · {s.total_sessions} buổi · {s.total_amount.toLocaleString("vi-VN")}đ
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-1 text-xs font-medium ${
                s.status === "approved"
                  ? "bg-emerald-100 text-emerald-700"
                  : s.status === "paid_reported"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {STATUS_LABEL[s.status]}
            </span>
            {s.status === "paid_reported" && (
              <button
                onClick={() => handleApprove(s._id)}
                disabled={busyId === s._id}
                className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              >
                Duyệt
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
