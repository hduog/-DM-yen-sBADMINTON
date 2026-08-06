"use client";

import { useEffect, useState } from "react";

type SessionItem = {
  _id: string;
  date: string;
  start_time: string;
  end_time: string;
  min_required: number;
  status: string;
  notify_sent_at?: string;
  need_recruit?: boolean;
  recruit_count_needed?: number;
  notes?: string;
  cost_settled_at?: string;
  pass_court_at?: string;
};

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

function combineVNDateTime(dateStr: string, hhmm: string): Date {
  const date = new Date(dateStr);
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), h, m) - VN_OFFSET_MS);
}

// Badge trạng thái suy ra từ thời gian thực + trạng thái quyết toán/huỷ, thay cho set cũ
// (scheduled/confirmed_enough/confirmed_shortage/cancelled) — mỗi trạng thái 1 màu để phân biệt nhanh.
function getDisplayStatus(session: SessionItem): { label: string; className: string } {
  if (session.status === "cancelled") {
    return { label: "Đã hủy", className: "bg-rose-100 text-rose-700" };
  }
  if (session.cost_settled_at) {
    return { label: "Đã quyết toán", className: "bg-violet-100 text-violet-700" };
  }
  if (session.pass_court_at) {
    return { label: "Đã pass sân", className: "bg-cyan-100 text-cyan-700" };
  }
  const now = new Date();
  const startAt = combineVNDateTime(session.date, session.start_time);
  const endAt = combineVNDateTime(session.date, session.end_time);
  if (now >= endAt) return { label: "Chưa quyết toán", className: "bg-amber-100 text-amber-700" };
  if (now >= startAt) return { label: "Đang diễn ra", className: "bg-emerald-100 text-emerald-700" };
  if (startAt.getTime() - now.getTime() <= TWELVE_HOURS_MS) {
    return { label: "Sắp diễn ra", className: "bg-blue-100 text-blue-700" };
  }
  return { label: "Đã lên lịch", className: "bg-zinc-100 text-zinc-600" };
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.75} stroke="currentColor" className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4.5v5h5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 9.5A8 8 0 1 1 4 13.5" />
    </svg>
  );
}

export default function AttendancePage() {
  const [sessions, setSessions] = useState<SessionItem[] | null>(null);
  const [form, setForm] = useState({ date: "", start_time: "18:30", end_time: "20:00", min_required: 8 });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  function load() {
    fetch("/api/sessions")
      .then((r) => r.json())
      .then(setSessions);
  }

  useEffect(load, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    load();
    setShowCreateForm(false);
  }

  async function handleSendNotice(id: string) {
    setBusyId(id);
    const res = await fetch(`/api/sessions/${id}/send-notice`, { method: "POST" });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Gửi thông báo thất bại");
      return;
    }
    load();
  }

  async function handleSettle(id: string) {
    if (!window.confirm("Xác nhận quyết toán chi phí buổi tập này vào sao kê?")) return;
    setSettlingId(id);
    const res = await fetch(`/api/sessions/${id}/settle`, { method: "POST" });
    setSettlingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Quyết toán thất bại");
      return;
    }
    load();
  }

  async function handleReset(id: string) {
    if (
      !window.confirm(
        "Xác nhận reset buổi tập này? Toàn bộ kết quả quyết toán/huỷ/pass sân sẽ bị xoá, coi như buổi tập chưa xử lý gì."
      )
    )
      return;
    setResettingId(id);
    const res = await fetch(`/api/sessions/${id}/reset`, { method: "POST" });
    setResettingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Reset thất bại");
      return;
    }
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <button
          type="button"
          onClick={() => setShowCreateForm((v) => !v)}
          className="flex w-full items-center justify-between text-sm font-semibold text-zinc-700"
        >
          Tạo buổi tập thêm
          <span className="text-xs font-normal text-zinc-400">{showCreateForm ? "Thu gọn ▲" : "Mở rộng ▼"}</span>
        </button>
        {showCreateForm && (
          <form onSubmit={handleCreate} className="mt-3 flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
              />
              <input
                type="number"
                min={1}
                required
                value={form.min_required}
                onChange={(e) => setForm({ ...form, min_required: Number(e.target.value) })}
                placeholder="Số người tối thiểu"
                className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
              />
              <input
                type="time"
                required
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
              />
              <input
                type="time"
                required
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </div>
            <button className="mt-1 rounded bg-zinc-900 py-2 text-sm font-medium text-white">
              Tạo buổi tập
            </button>
          </form>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {sessions === null && <p className="text-sm text-zinc-400">Đang tải...</p>}
        {sessions?.length === 0 && <p className="text-sm text-zinc-400">Chưa có buổi tập nào.</p>}
        {sessions?.map((s) => {
          const isLocked = s.status === "cancelled" || !!s.cost_settled_at || !!s.pass_court_at;
          const isNotEndedYet = new Date() < combineVNDateTime(s.date, s.end_time);
          const displayStatus = getDisplayStatus(s);
          return (
            <div key={s._id} className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {new Date(s.date).toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" })}{" "}
                    · {s.start_time}-{s.end_time}
                  </p>
                  <p className="text-xs text-zinc-500">Tối thiểu {s.min_required} người</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <button
                    onClick={() => handleReset(s._id)}
                    disabled={resettingId === s._id}
                    title="Reset buổi tập"
                    className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40"
                  >
                    <ResetIcon />
                  </button>
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${displayStatus.className}`}>
                    {displayStatus.label}
                  </span>
                </div>
              </div>
              {s.need_recruit && (
                <p className="mt-1 text-xs text-amber-600">
                  Cần tuyển thêm {s.recruit_count_needed} người (xem tab Tuyển vãng lai)
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  disabled={!!s.notify_sent_at || busyId === s._id || isLocked}
                  onClick={() => handleSendNotice(s._id)}
                  className="rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                >
                  {s.notify_sent_at ? "Đã gửi thông báo" : "Gửi thông báo điểm danh"}
                </button>
                <button
                  onClick={() => setExpandedId(expandedId === s._id ? null : s._id)}
                  className="rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium"
                >
                  {expandedId === s._id ? "Thu gọn" : "Xem chi tiết"}
                </button>
              </div>
              {expandedId === s._id && <SessionDetail session={s} onChanged={load} isLocked={isLocked} />}

              <button
                onClick={() => handleSettle(s._id)}
                disabled={isLocked || isNotEndedYet || settlingId === s._id}
                title={isNotEndedYet ? "Chỉ quyết toán được sau khi buổi tập kết thúc" : undefined}
                className={`mt-3 w-full rounded-lg py-3 text-sm font-semibold disabled:cursor-not-allowed ${
                  isLocked || isNotEndedYet
                    ? "bg-zinc-100 text-zinc-400"
                    : "bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                }`}
              >
                {s.cost_settled_at
                  ? "Đã quyết toán ✓"
                  : s.status === "cancelled"
                    ? "Đã hủy"
                    : s.pass_court_at
                      ? "Đã pass sân"
                      : isNotEndedYet
                        ? "Chưa thể quyết toán (buổi tập chưa kết thúc)"
                        : settlingId === s._id
                          ? "Đang quyết toán..."
                          : "Quyết toán"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ANSWER_LABEL: Record<string, string> = {
  present: "Có",
  absent: "Không",
  no_response: "Chưa trả lời",
};

const ANSWER_STYLE: Record<string, string> = {
  present: "bg-emerald-100 text-emerald-700",
  absent: "bg-rose-100 text-rose-700",
  no_response: "bg-zinc-100 text-zinc-500",
};

type AttendanceEntry = {
  member_id: string;
  full_name: string;
  username?: string;
  answer: string;
  reason?: string;
};
type AttendanceDetail = {
  list: AttendanceEntry[];
  presentCount: number;
  absentCount: number;
  noResponseCount: number;
};

function SessionDetail({
  session,
  onChanged,
  isLocked,
}: {
  session: SessionItem;
  onChanged: () => void;
  isLocked: boolean;
}) {
  const [attendance, setAttendance] = useState<AttendanceDetail | null>(null);
  const [notes, setNotes] = useState(session.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [passingCourt, setPassingCourt] = useState(false);
  const [minRequired, setMinRequired] = useState(session.min_required);
  const [savingMinRequired, setSavingMinRequired] = useState(false);
  const isCancelled = session.status === "cancelled";

  useEffect(() => {
    fetch(`/api/sessions/${session._id}/attendance`)
      .then((r) => r.json())
      .then(setAttendance);
  }, [session._id]);

  async function handleSaveNotes() {
    setSavingNotes(true);
    await fetch(`/api/sessions/${session._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    setSavingNotes(false);
  }

  async function handleSaveMinRequired() {
    setSavingMinRequired(true);
    const res = await fetch(`/api/sessions/${session._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ min_required: minRequired }),
    });
    setSavingMinRequired(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Sửa số người tối thiểu thất bại");
      return;
    }
    onChanged();
  }

  async function handleRemind() {
    setReminding(true);
    const res = await fetch(`/api/sessions/${session._id}/remind`, { method: "POST" });
    setReminding(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Gửi nhắc nhở thất bại");
    }
  }

  async function handleCancel() {
    if (!window.confirm("Xác nhận hủy buổi tập này?")) return;
    setCancelling(true);
    const res = await fetch(`/api/sessions/${session._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    setCancelling(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Hủy buổi tập thất bại");
      return;
    }
    onChanged();
  }

  async function handlePassCourt() {
    setPassingCourt(true);
    const res = await fetch(`/api/sessions/${session._id}/pass-court`, { method: "POST" });
    setPassingCourt(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Gửi thông báo pass sân thất bại");
      return;
    }
    onChanged();
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="rounded-lg bg-zinc-50 p-3">
        <h3 className="mb-2 text-xs font-semibold text-zinc-700">Điểm danh</h3>
        {!attendance && <p className="text-xs text-zinc-400">Đang tải...</p>}
        {attendance && (
          <>
            <p className="mb-2 text-xs text-zinc-500">
              {attendance.presentCount} có mặt · {attendance.absentCount} không tham gia ·{" "}
              {attendance.noResponseCount} chưa trả lời
            </p>
            <div className="flex flex-col gap-1">
              {attendance.list.map((m) => (
                <div key={m.member_id} className="flex items-center justify-between text-sm">
                  <span>{m.full_name}</span>
                  <div className="flex items-center gap-2">
                    {m.answer === "absent" && m.reason && (
                      <span className="text-xs text-zinc-400">{m.reason}</span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ANSWER_STYLE[m.answer]}`}>
                      {ANSWER_LABEL[m.answer] ?? m.answer}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <GuestForm sessionId={session._id} disabled={isLocked} />

      <CostForm sessionId={session._id} disabled={isLocked} />

      <div className="rounded-lg bg-zinc-50 p-3">
        <h3 className="mb-2 text-xs font-semibold text-zinc-700">Số người tối thiểu</h3>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={minRequired}
            onChange={(e) => setMinRequired(Number(e.target.value))}
            disabled={isLocked}
            className="w-24 rounded border border-zinc-300 px-2 py-1.5 text-sm disabled:bg-zinc-100 disabled:text-zinc-400"
          />
          <button
            onClick={handleSaveMinRequired}
            disabled={savingMinRequired || isLocked || minRequired === session.min_required || minRequired < 1}
            className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          >
            Lưu
          </button>
        </div>
      </div>

      <div className="rounded-lg bg-zinc-50 p-3">
        <h3 className="mb-2 text-xs font-semibold text-zinc-700">Ghi chú</h3>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          disabled={isLocked}
          placeholder="Ghi chú cho buổi tập này..."
          className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm disabled:bg-zinc-100 disabled:text-zinc-400"
        />
        <button
          onClick={handleSaveNotes}
          disabled={savingNotes || isLocked}
          className="mt-2 rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          Lưu ghi chú
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleRemind}
          disabled={reminding || isLocked}
          className="rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
        >
          Nhắc điểm danh
        </button>
        <button
          onClick={handlePassCourt}
          disabled={passingCourt || isLocked}
          className="rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
        >
          {session.pass_court_at ? "Đã pass sân ✓" : passingCourt ? "Đang gửi..." : "Pass sân"}
        </button>
        <button
          onClick={handleCancel}
          disabled={cancelling || isLocked}
          className="rounded border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-600 disabled:opacity-40"
        >
          {isCancelled ? "Đã hủy" : "Hủy buổi tập"}
        </button>
      </div>
    </div>
  );
}

type MemberOption = { _id: string; full_name: string };

type GuestEntry = {
  _id: string;
  guest_name?: string;
  quantity: number;
  responsible_member_id: { _id: string; full_name: string } | null;
};

function GuestForm({ sessionId, disabled }: { sessionId: string; disabled?: boolean }) {
  const [guests, setGuests] = useState<GuestEntry[] | null>(null);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [form, setForm] = useState({ guest_name: "", quantity: 1, responsible_member_id: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function load() {
    fetch(`/api/sessions/${sessionId}/guests`)
      .then((r) => r.json())
      .then(setGuests);
  }

  useEffect(load, [sessionId]);
  useEffect(() => {
    fetch("/api/members")
      .then((r) => r.json())
      .then(setMembers);
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.responsible_member_id) {
      setError("Vui lòng chọn người chịu trách nhiệm");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch(`/api/sessions/${sessionId}/guests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const resData = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(resData.error ?? "Thêm khách vãng lai thất bại");
      return;
    }
    setForm({ guest_name: "", quantity: 1, responsible_member_id: "" });
    load();
  }

  async function handleDelete(guestId: string) {
    await fetch(`/api/sessions/${sessionId}/guests/${guestId}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="rounded-lg bg-zinc-50 p-3">
      <h3 className="mb-2 text-xs font-semibold text-zinc-700">Khách vãng lai</h3>
      {guests === null && <p className="text-xs text-zinc-400">Đang tải...</p>}
      {guests?.length === 0 && <p className="text-xs text-zinc-400">Chưa có khách vãng lai.</p>}
      {guests && guests.length > 0 && (
        <div className="mb-2 flex flex-col gap-1">
          {guests.map((g) => (
            <div key={g._id} className="flex items-center justify-between text-sm">
              <span>
                {g.guest_name || "(không tên)"} × {g.quantity} — {g.responsible_member_id?.full_name ?? "(đã xoá)"}
              </span>
              <button
                onClick={() => handleDelete(g._id)}
                disabled={disabled}
                className="text-xs text-red-500 disabled:opacity-40"
              >
                Xoá
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2">
        <input
          type="text"
          placeholder="Tên/ghi chú (tuỳ chọn)"
          value={form.guest_name}
          onChange={(e) => setForm({ ...form, guest_name: e.target.value })}
          disabled={disabled}
          className="rounded border border-zinc-300 px-2 py-1.5 text-sm disabled:bg-zinc-100 disabled:text-zinc-400"
        />
        <input
          type="number"
          min={1}
          value={form.quantity}
          onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
          disabled={disabled}
          className="w-20 rounded border border-zinc-300 px-2 py-1.5 text-sm disabled:bg-zinc-100 disabled:text-zinc-400"
        />
        <select
          value={form.responsible_member_id}
          onChange={(e) => setForm({ ...form, responsible_member_id: e.target.value })}
          disabled={disabled}
          className="rounded border border-zinc-300 px-2 py-1.5 text-sm disabled:bg-zinc-100 disabled:text-zinc-400"
        >
          <option value="">Người chịu trách nhiệm</option>
          {members.map((m) => (
            <option key={m._id} value={m._id}>
              {m.full_name}
            </option>
          ))}
        </select>
        <button
          disabled={saving || disabled}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium disabled:opacity-40"
        >
          + Thêm
        </button>
      </form>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

type ItemConfigItem = { _id: string; name: string; unit: string; unit_price: number };
type CostSummary = {
  costs: { item_id: { _id: string }; quantity: number }[];
  items: ItemConfigItem[];
  presentCount: number;
  totalUnits: number;
  fixedCost: number;
  total: number;
  perPerson: number;
};

function CostForm({ sessionId, disabled }: { sessionId: string; disabled?: boolean }) {
  const [data, setData] = useState<CostSummary | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}/costs`)
      .then((r) => r.json())
      .then((d: CostSummary) => {
        setData(d);
        const initial: Record<string, number> = {};
        for (const c of d.costs) initial[c.item_id._id] = c.quantity;
        setQuantities(initial);
      });
  }, [sessionId]);

  async function handleSave() {
    setSaving(true);
    const items = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([item_id, quantity]) => ({ item_id, quantity }));
    const res = await fetch(`/api/sessions/${sessionId}/costs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const summary = await res.json();
    setSaving(false);
    setData((prev) =>
      prev
        ? {
            ...prev,
            total: summary.total,
            perPerson: summary.perPerson,
            presentCount: summary.presentCount,
            totalUnits: summary.totalUnits,
          }
        : prev
    );
  }

  if (!data) return <p className="text-xs text-zinc-400">Đang tải...</p>;

  if (data.items.length === 0) {
    return (
      <p className="text-xs text-zinc-400">
        Chưa có danh mục vật phẩm. Vào tab Cấu hình để thêm (VD: trái cầu, chai nước).
      </p>
    );
  }

  return (
    <div className="rounded-lg bg-zinc-50 p-3">
      <h3 className="mb-2 text-xs font-semibold text-zinc-700">Chi phí</h3>
      <p className="mb-2 text-xs text-zinc-500">
        Chi phí cố định: <b>{data.fixedCost.toLocaleString("vi-VN")}đ</b>
      </p>
      {data.items.map((item) => (
        <div key={item._id} className="flex items-center justify-between gap-2 py-1">
          <span className="text-sm">
            {item.name} <span className="text-zinc-400">({item.unit_price.toLocaleString("vi-VN")}đ/{item.unit})</span>
          </span>
          <input
            type="number"
            min={0}
            value={quantities[item._id] ?? ""}
            onChange={(e) => setQuantities({ ...quantities, [item._id]: Number(e.target.value) })}
            disabled={disabled}
            className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm disabled:bg-zinc-100 disabled:text-zinc-400"
          />
        </div>
      ))}
      <div className="mt-2 flex items-center justify-between border-t border-zinc-200 pt-2 text-sm">
        <span>
          Tổng: <b>{data.total.toLocaleString("vi-VN")}đ</b> · {data.presentCount} thành viên có mặt
          {data.totalUnits > data.presentCount && ` + ${data.totalUnits - data.presentCount} khách vãng lai`} ={" "}
          {data.totalUnits} người · <b>{data.perPerson.toLocaleString("vi-VN")}đ</b>/người
        </span>
        <button
          onClick={handleSave}
          disabled={saving || disabled}
          className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          Lưu
        </button>
      </div>
    </div>
  );
}
