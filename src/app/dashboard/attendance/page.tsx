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
};

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Đã lên lịch",
  confirmed_enough: "Đủ người",
  confirmed_shortage: "Thiếu người",
  cancelled: "Đã huỷ",
};

export default function AttendancePage() {
  const [sessions, setSessions] = useState<SessionItem[] | null>(null);
  const [form, setForm] = useState({ date: "", start_time: "18:30", end_time: "20:00", min_required: 8 });
  const [busyId, setBusyId] = useState<string | null>(null);
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
        {sessions?.map((s) => (
          <div key={s._id} className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {new Date(s.date).toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" })}{" "}
                  · {s.start_time}-{s.end_time}
                </p>
                <p className="text-xs text-zinc-500">Tối thiểu {s.min_required} người</p>
              </div>
              <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600">
                {STATUS_LABEL[s.status] ?? s.status}
              </span>
            </div>
            {s.need_recruit && (
              <p className="mt-1 text-xs text-amber-600">
                Cần tuyển thêm {s.recruit_count_needed} người (xem tab Tuyển vãng lai)
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                disabled={!!s.notify_sent_at || busyId === s._id}
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
            {expandedId === s._id && <SessionDetail session={s} onChanged={load} />}
          </div>
        ))}
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

function SessionDetail({ session, onChanged }: { session: SessionItem; onChanged: () => void }) {
  const [attendance, setAttendance] = useState<AttendanceDetail | null>(null);
  const [notes, setNotes] = useState(session.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [passingCourt, setPassingCourt] = useState(false);
  const [settling, setSettling] = useState(false);
  const isCancelled = session.status === "cancelled";
  const isSettled = !!session.cost_settled_at;

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
    }
  }

  async function handleSettle() {
    if (!window.confirm("Xác nhận quyết toán chi phí buổi tập này vào sao kê?")) return;
    setSettling(true);
    const res = await fetch(`/api/sessions/${session._id}/settle`, { method: "POST" });
    setSettling(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Quyết toán thất bại");
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

      <GuestForm sessionId={session._id} />

      <CostForm sessionId={session._id} />

      <button
        onClick={handleSettle}
        disabled={settling || isSettled || isCancelled}
        className="rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
      >
        {isSettled ? "Đã quyết toán" : settling ? "Đang quyết toán..." : "Quyết toán"}
      </button>

      <div className="rounded-lg bg-zinc-50 p-3">
        <h3 className="mb-2 text-xs font-semibold text-zinc-700">Ghi chú</h3>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Ghi chú cho buổi tập này..."
          className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
        />
        <button
          onClick={handleSaveNotes}
          disabled={savingNotes}
          className="mt-2 rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          Lưu ghi chú
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleRemind}
          disabled={reminding || isCancelled}
          className="rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
        >
          Nhắc điểm danh
        </button>
        <button
          onClick={handlePassCourt}
          disabled={passingCourt}
          className="rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
        >
          {passingCourt ? "Đang gửi..." : "Pass sân"}
        </button>
        <button
          onClick={handleCancel}
          disabled={cancelling || isCancelled}
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

function GuestForm({ sessionId }: { sessionId: string }) {
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
              <button onClick={() => handleDelete(g._id)} className="text-xs text-red-500">
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
          className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
        />
        <input
          type="number"
          min={1}
          value={form.quantity}
          onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
          className="w-20 rounded border border-zinc-300 px-2 py-1.5 text-sm"
        />
        <select
          value={form.responsible_member_id}
          onChange={(e) => setForm({ ...form, responsible_member_id: e.target.value })}
          className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
        >
          <option value="">Người chịu trách nhiệm</option>
          {members.map((m) => (
            <option key={m._id} value={m._id}>
              {m.full_name}
            </option>
          ))}
        </select>
        <button disabled={saving} className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium disabled:opacity-40">
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

function CostForm({ sessionId }: { sessionId: string }) {
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
            className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm"
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
          disabled={saving}
          className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          Lưu
        </button>
      </div>
    </div>
  );
}
