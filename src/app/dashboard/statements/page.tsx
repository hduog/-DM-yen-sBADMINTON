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

type MemberOption = { _id: string; full_name: string };

const STATUS_LABEL: Record<Statement["status"], string> = {
  pending: "Chưa thanh toán",
  paid_reported: "Chờ duyệt",
  approved: "Đã duyệt",
};

function currentVNYearMonth() {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

export default function StatementsPage() {
  const [statements, setStatements] = useState<Statement[] | null>(null);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [memberId, setMemberId] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");

  useEffect(() => {
    fetch("/api/members")
      .then((r) => r.json())
      .then(setMembers);
  }, []);

  function load() {
    const params = new URLSearchParams();
    if (memberId) params.set("memberId", memberId);
    if (month) params.set("month", month);
    if (year) params.set("year", year);
    fetch(`/api/statements?${params.toString()}`)
      .then((r) => r.json())
      .then(setStatements);
  }

  useEffect(load, [memberId, month, year]);

  async function handleApprove(id: string) {
    setBusyId(id);
    await fetch(`/api/statements/${id}/approve`, { method: "POST" });
    setBusyId(null);
    load();
  }

  const { year: thisYear } = currentVNYearMonth();
  const yearOptions = Array.from({ length: 4 }, (_, i) => thisYear - i);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2 rounded-xl border border-zinc-200 bg-white p-3">
        <select
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
        >
          <option value="">Tất cả thành viên</option>
          {members.map((m) => (
            <option key={m._id} value={m._id}>
              {m.full_name}
            </option>
          ))}
        </select>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
        >
          <option value="">Tất cả tháng</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              Tháng {m}
            </option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
        >
          <option value="">Tất cả năm</option>
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {statements === null && <p className="text-sm text-zinc-400">Đang tải...</p>}
      {statements?.length === 0 && (
        <p className="text-sm text-zinc-400">
          Không có sao kê nào khớp bộ lọc. Sao kê được tự động tạo vào ngày chốt tháng đã cấu hình.
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
