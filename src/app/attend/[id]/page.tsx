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

type AttendData = {
  session: SessionInfo;
  list: AttendanceEntry[];
  presentCount: number;
  absentCount: number;
  noResponseCount: number;
  viewerMemberId: string;
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

  if (notFound) {
    return (
      <p className="text-center text-sm text-zinc-500">Không tìm thấy buổi tập này.</p>
    );
  }
  if (!data) return <p className="text-sm text-zinc-400">Đang tải...</p>;

  const { session, list } = data;
  const viewer = list.find((m) => m.member_id === data.viewerMemberId);
  const isCancelled = session.status === "cancelled";

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
          Đã có {data.presentCount}/{session.min_required} người tham gia
        </p>
      </div>

      {isCancelled ? (
        <p className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
          Buổi tập này đã bị huỷ, không thể điểm danh.
        </p>
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
