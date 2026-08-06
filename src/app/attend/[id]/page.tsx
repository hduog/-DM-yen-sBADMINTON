"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const WEEKDAY_LABEL = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Đang chờ điểm danh",
  confirmed_enough: "Đã đủ người",
  confirmed_shortage: "Thiếu người",
  cancelled: "Đã huỷ",
};

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

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function combineVNDateTime(dateStr: string, hhmm: string): Date {
  const date = new Date(dateStr);
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), h, m) - VN_OFFSET_MS);
}

type SessionInfo = {
  _id: string;
  date: string;
  start_time: string;
  end_time: string;
  min_required: number;
  status: string;
};

type AttendanceEntry = {
  member_id: string;
  full_name: string;
  username?: string;
  answer: string;
  reason?: string;
};

type GuestEntry = {
  _id: string;
  guest_name?: string;
  quantity: number;
};

type AttendData = {
  session: SessionInfo;
  list: AttendanceEntry[];
  presentCount: number;
  absentCount: number;
  noResponseCount: number;
  totalUnits: number;
  viewerMemberId: string;
  myGuests: GuestEntry[];
};

function formatSessionDate(dateStr: string) {
  const date = new Date(dateStr);
  return `${WEEKDAY_LABEL[date.getUTCDay()]}, ${date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  })}`;
}

export default function AttendSessionPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [data, setData] = useState<AttendData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState<"present" | "absent" | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [guestForm, setGuestForm] = useState({ guest_name: "", quantity: 1 });
  const [guestEditingId, setGuestEditingId] = useState<string | null>(null);
  const [guestSaving, setGuestSaving] = useState(false);
  const [guestError, setGuestError] = useState("");

  function load() {
    fetch(`/api/attend/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d: AttendData) => {
        setData(d);
        setNotFound(false);
        const viewer = d.list.find((m) => m.member_id === d.viewerMemberId);
        if (!viewer || viewer.answer === "no_response") setEditing(true);
      })
      .catch(() => setNotFound(true));
  }

  useEffect(load, [id]);

  async function handleSubmit() {
    if (!choice) return;
    if (choice === "absent" && !reason.trim()) {
      setError("Vui lòng nhập lý do không tham gia");
      return;
    }
    setSubmitting(true);
    setError("");
    const res = await fetch(`/api/attend/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer: choice, reason: choice === "absent" ? reason.trim() : undefined }),
    });
    const resData = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      setError(resData.error ?? "Gửi lựa chọn thất bại");
      return;
    }
    setData((prev) => (prev ? { ...prev, ...resData } : prev));
    setEditing(false);
  }

  function resetGuestForm() {
    setGuestForm({ guest_name: "", quantity: 1 });
    setGuestEditingId(null);
    setGuestError("");
  }

  function startEditGuest(guest: GuestEntry) {
    setGuestForm({ guest_name: guest.guest_name ?? "", quantity: guest.quantity });
    setGuestEditingId(guest._id);
    setGuestError("");
  }

  async function handleSaveGuest() {
    if (guestForm.quantity < 1) {
      setGuestError("Số lượng không hợp lệ");
      return;
    }
    setGuestSaving(true);
    setGuestError("");
    const url = guestEditingId ? `/api/attend/${id}/guests/${guestEditingId}` : `/api/attend/${id}/guests`;
    const res = await fetch(url, {
      method: guestEditingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(guestForm),
    });
    const resData = await res.json().catch(() => ({}));
    setGuestSaving(false);
    if (!res.ok) {
      setGuestError(resData.error ?? "Lưu khách vãng lai thất bại");
      return;
    }
    setData((prev) => (prev ? { ...prev, ...resData } : prev));
    resetGuestForm();
  }

  async function handleDeleteGuest(guestId: string) {
    setGuestSaving(true);
    const res = await fetch(`/api/attend/${id}/guests/${guestId}`, { method: "DELETE" });
    const resData = await res.json().catch(() => ({}));
    setGuestSaving(false);
    if (!res.ok) {
      setGuestError(resData.error ?? "Xoá khách vãng lai thất bại");
      return;
    }
    setData((prev) => (prev ? { ...prev, ...resData } : prev));
    if (guestEditingId === guestId) resetGuestForm();
  }

  if (notFound) {
    return (
      <p className="text-center text-sm text-zinc-500">Không tìm thấy buổi tập này.</p>
    );
  }
  if (!data) return <p className="text-sm text-zinc-400">Đang tải...</p>;

  const { session, list } = data;
  const viewer = list.find((m) => m.member_id === data.viewerMemberId);
  const isCancelled = session.status === "cancelled";
  const isExpired = new Date() >= combineVNDateTime(session.date, session.start_time);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="font-medium">
            {formatSessionDate(session.date)} · {session.start_time}-{session.end_time}
          </p>
          <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600">
            {STATUS_LABEL[session.status] ?? session.status}
          </span>
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Đã có {data.totalUnits}/{session.min_required} người tham gia
          {data.totalUnits > data.presentCount && ` (gồm ${data.totalUnits - data.presentCount} khách vãng lai)`}
        </p>
      </div>

      {isCancelled ? (
        <p className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
          Buổi tập này đã bị huỷ, không thể điểm danh.
        </p>
      ) : isExpired ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          <p>Đã quá giờ điểm danh — buổi tập đã bắt đầu lúc {session.start_time}, bạn không thể điểm danh/cập nhật lựa chọn nữa.</p>
          {viewer && viewer.answer !== "no_response" && (
            <p className="mt-2">
              Lựa chọn trước đó của bạn:{" "}
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ANSWER_STYLE[viewer.answer]}`}>
                {ANSWER_LABEL[viewer.answer]}
              </span>
            </p>
          )}
        </div>
      ) : editing ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-zinc-700">
            {viewer && viewer.answer !== "no_response" ? "Cập nhật lựa chọn" : "Bạn có tham gia buổi tập này không?"}
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => setChoice("present")}
              className={`flex-1 rounded-lg border py-2 text-sm font-medium ${
                choice === "present"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-zinc-300 text-zinc-600"
              }`}
            >
              Tham gia
            </button>
            <button
              onClick={() => setChoice("absent")}
              className={`flex-1 rounded-lg border py-2 text-sm font-medium ${
                choice === "absent" ? "border-rose-500 bg-rose-50 text-rose-700" : "border-zinc-300 text-zinc-600"
              }`}
            >
              Không tham gia
            </button>
          </div>

          {choice === "absent" && (
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Lý do không tham gia (bắt buộc)"
              className="mt-3 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
            />
          )}

          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={!choice || submitting}
            className="mt-3 w-full rounded bg-zinc-900 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {submitting ? "Đang gửi..." : "Xác nhận"}
          </button>
        </div>
      ) : (
        viewer && (
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-sm">
              Bạn đã chọn:{" "}
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ANSWER_STYLE[viewer.answer]}`}>
                {ANSWER_LABEL[viewer.answer]}
              </span>
            </p>
            {viewer.answer === "absent" && viewer.reason && (
              <p className="mt-1 text-xs text-zinc-500">Lý do: {viewer.reason}</p>
            )}
            <button
              onClick={() => {
                setChoice(viewer.answer as "present" | "absent");
                setReason(viewer.reason ?? "");
                setEditing(true);
              }}
              className="mt-3 rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium"
            >
              Cập nhật lựa chọn
            </button>
          </div>
        )
      )}

      {!isCancelled && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-zinc-700">Khách vãng lai</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Bạn có thể đăng ký thêm khách vãng lai đi cùng. Bạn sẽ là người chịu trách nhiệm chi phí của khách
            (cộng dồn vào suất của bạn, dù bạn có tham gia buổi này hay không).
          </p>

          {data.myGuests.length > 0 && (
            <div className="mt-3 flex flex-col gap-1">
              {data.myGuests.map((g) => (
                <div key={g._id} className="flex items-center justify-between text-sm">
                  <span>
                    {g.guest_name || "(không tên)"} × {g.quantity}
                  </span>
                  {!isExpired && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => startEditGuest(g)}
                        disabled={guestSaving}
                        className="text-xs font-medium text-zinc-600 disabled:opacity-40"
                      >
                        Sửa
                      </button>
                      <button
                        onClick={() => handleDeleteGuest(g._id)}
                        disabled={guestSaving}
                        className="text-xs text-red-500 disabled:opacity-40"
                      >
                        Xoá
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {isExpired ? (
            <p className="mt-3 text-xs text-zinc-400">Đã quá giờ, không thể đăng ký/chỉnh sửa khách vãng lai.</p>
          ) : (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <input
                type="text"
                placeholder="Tên/ghi chú (tuỳ chọn)"
                value={guestForm.guest_name}
                onChange={(e) => setGuestForm({ ...guestForm, guest_name: e.target.value })}
                className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
              />
              <input
                type="number"
                min={1}
                value={guestForm.quantity}
                onChange={(e) => setGuestForm({ ...guestForm, quantity: Number(e.target.value) })}
                className="w-20 rounded border border-zinc-300 px-2 py-1.5 text-sm"
              />
              <button
                onClick={handleSaveGuest}
                disabled={guestSaving}
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium disabled:opacity-40"
              >
                {guestEditingId ? "Lưu" : "+ Thêm"}
              </button>
              {guestEditingId && (
                <button onClick={resetGuestForm} disabled={guestSaving} className="text-xs text-zinc-500">
                  Huỷ
                </button>
              )}
            </div>
          )}
          {guestError && <p className="mt-2 text-xs text-red-500">{guestError}</p>}
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <h3 className="mb-2 text-xs font-semibold text-zinc-700">Điểm danh cả buổi</h3>
        <p className="mb-2 text-xs text-zinc-500">
          {data.presentCount} có mặt · {data.absentCount} không tham gia · {data.noResponseCount} chưa trả lời
        </p>
        <div className="flex flex-col gap-1">
          {list.map((m) => (
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
      </div>
    </div>
  );
}
