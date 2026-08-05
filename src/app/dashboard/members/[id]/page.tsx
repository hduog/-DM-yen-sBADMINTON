"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type StatementStatus = "pending" | "paid_reported" | "approved";

type MemberInfo = {
  _id: string;
  telegram_id: number;
  full_name: string;
  username?: string;
  role: "admin" | "member";
  status: "active" | "inactive";
  joined_at: string;
  statement_chat_id?: number;
};

type Statement = {
  _id: string;
  month: string;
  total_sessions: number;
  total_amount: number;
  status: StatementStatus;
};

type MemberDetailData = {
  member: MemberInfo;
  monthKey: string;
  sessionsAttended: number;
  statements: Statement[];
};

const STATEMENT_STATUS_LABEL: Record<StatementStatus, string> = {
  pending: "Chưa thanh toán",
  paid_reported: "Chờ duyệt",
  approved: "Đã duyệt",
};

const ROLE_LABEL: Record<MemberInfo["role"], string> = {
  admin: "Admin",
  member: "Thành viên",
};

function currentVNYearMonth() {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

export default function MemberDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [{ year, month }, setPeriod] = useState(currentVNYearMonth());
  const [data, setData] = useState<MemberDetailData | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [chatIdInput, setChatIdInput] = useState("");
  const [savingChatId, setSavingChatId] = useState(false);

  const [cancelling, setCancelling] = useState(false);

  function load() {
    fetch(`/api/members/${id}?month=${month}&year=${year}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d: MemberDetailData) => {
        setData(d);
        setChatIdInput(d.member.statement_chat_id ? String(d.member.statement_chat_id) : "");
      })
      .catch(() => setNotFound(true));
  }

  useEffect(load, [id, month, year]);

  const selectedStatement = useMemo(
    () => data?.statements.find((s) => s.month === data.monthKey) ?? null,
    [data]
  );

  async function handleSaveChatId() {
    setSavingChatId(true);
    await fetch(`/api/members/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        statement_chat_id: chatIdInput.trim() === "" ? null : Number(chatIdInput),
      }),
    });
    setSavingChatId(false);
    load();
  }

  async function handleCancelMember() {
    if (!data) return;
    if (!confirm(`Hủy thành viên "${data.member.full_name}"? Người này sẽ mất quyền truy cập.`)) {
      return;
    }
    setCancelling(true);
    const res = await fetch(`/api/members/${id}`, { method: "DELETE" });
    setCancelling(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? "Hủy thành viên thất bại");
      return;
    }
    load();
  }

  if (notFound) {
    return (
      <div className="flex flex-col gap-3">
        <Link href="/dashboard/members" className="text-sm text-zinc-500 hover:text-zinc-700">
          ← Danh sách thành viên
        </Link>
        <p className="text-sm text-zinc-400">Không tìm thấy thành viên.</p>
      </div>
    );
  }

  if (!data) return <p className="text-sm text-zinc-400">Đang tải...</p>;

  const { member } = data;
  const yearOptions = Array.from({ length: 4 }, (_, i) => currentVNYearMonth().year - i);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/dashboard/members" className="text-sm text-zinc-500 hover:text-zinc-700">
        ← Danh sách thành viên
      </Link>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-lg font-semibold">{member.full_name}</p>
            <p className="text-xs text-zinc-500">
              {member.username ? `@${member.username} · ` : ""}Telegram ID {member.telegram_id}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Tham gia {new Date(member.joined_at).toLocaleDateString("vi-VN")}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span
              className={`rounded-full px-2 py-1 text-xs font-medium ${
                member.role === "admin" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {ROLE_LABEL[member.role]}
            </span>
            {member.status === "inactive" && (
              <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-600">
                Ngừng hoạt động
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-700">Group chat riêng (gửi noti sao kê)</h2>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            value={chatIdInput}
            onChange={(e) => setChatIdInput(e.target.value)}
            placeholder="Chat ID"
            className="flex-1 rounded border border-zinc-300 px-2 py-1.5 text-sm"
          />
          <button
            onClick={handleSaveChatId}
            disabled={savingChatId}
            className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          >
            {savingChatId ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-zinc-400">
          Mẹo: thêm bot vào nhóm riêng của thành viên rồi gõ <code>/getid</code> trong nhóm đó để lấy Chat ID.
        </p>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-700">Xem theo tháng</h2>
          <div className="flex gap-2">
            <select
              value={month}
              onChange={(e) => setPeriod({ year, month: Number(e.target.value) })}
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  Tháng {m}
                </option>
              ))}
            </select>
            <select
              value={year}
              onChange={(e) => setPeriod({ year: Number(e.target.value), month })}
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="mt-3 text-sm">
          Số buổi tham gia: <b>{data.sessionsAttended}</b>
        </p>

        {selectedStatement ? (
          <StatementEditor key={selectedStatement._id} statement={selectedStatement} onSaved={load} />
        ) : (
          <p className="mt-3 text-xs text-zinc-400">Chưa có sao kê cho tháng {data.monthKey}.</p>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-700">Lịch sử sao kê</h2>
        <div className="mt-2 flex flex-col gap-1.5">
          {data.statements.length === 0 && <p className="text-xs text-zinc-400">Chưa có sao kê nào.</p>}
          {data.statements.map((s) => (
            <div
              key={s._id}
              className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-xs"
            >
              <span>
                Tháng {s.month} · {s.total_sessions} buổi · {s.total_amount.toLocaleString("vi-VN")}đ
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${
                  s.status === "approved"
                    ? "bg-emerald-100 text-emerald-700"
                    : s.status === "paid_reported"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {STATEMENT_STATUS_LABEL[s.status]}
              </span>
            </div>
          ))}
        </div>
      </section>

      <button
        onClick={handleCancelMember}
        disabled={cancelling}
        className="self-start rounded border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 disabled:opacity-40"
      >
        {cancelling ? "Đang hủy..." : "Hủy thành viên"}
      </button>
    </div>
  );
}

function StatementEditor({ statement, onSaved }: { statement: Statement; onSaved: () => void }) {
  const [form, setForm] = useState({
    total_sessions: statement.total_sessions,
    total_amount: statement.total_amount,
    status: statement.status,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/statements/${statement._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    onSaved();
  }

  async function handleDelete() {
    if (!confirm(`Xóa sao kê tháng ${statement.month}? Không thể hoàn tác.`)) return;
    setDeleting(true);
    await fetch(`/api/statements/${statement._id}`, { method: "DELETE" });
    setDeleting(false);
    onSaved();
  }

  return (
    <div className="mt-3 rounded-lg bg-zinc-50 p-3">
      <p className="text-xs font-semibold text-zinc-500">Sao kê tháng {statement.month}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <LabeledInput
          label="Số buổi"
          type="number"
          value={form.total_sessions}
          onChange={(v) => setForm({ ...form, total_sessions: Number(v) })}
        />
        <LabeledInput
          label="Tổng tiền"
          type="number"
          value={form.total_amount}
          onChange={(v) => setForm({ ...form, total_amount: Number(v) })}
        />
      </div>
      <label className="mt-2 flex flex-col gap-1 text-sm">
        <span className="text-zinc-600">Trạng thái</span>
        <select
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value as StatementStatus })}
          className="rounded border border-zinc-300 px-2 py-1.5"
        >
          <option value="pending">Chưa thanh toán</option>
          <option value="paid_reported">Chờ duyệt</option>
          <option value="approved">Đã duyệt</option>
        </select>
      </label>
      <div className="mt-3 flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          {saving ? "Đang lưu..." : "Lưu sao kê"}
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="rounded border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 disabled:opacity-40"
        >
          {deleting ? "Đang xóa..." : "Xóa sao kê"}
        </button>
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-zinc-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-zinc-300 px-2 py-1.5"
      />
    </label>
  );
}
