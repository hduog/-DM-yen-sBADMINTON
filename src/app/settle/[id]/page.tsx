"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const WEEKDAY_LABEL = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function combineVNDateTime(dateStr: string, hhmm: string): Date {
  const date = new Date(dateStr);
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), h, m) - VN_OFFSET_MS);
}

function formatSessionDate(dateStr: string) {
  const date = new Date(dateStr);
  return `${WEEKDAY_LABEL[date.getUTCDay()]}, ${date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  })}`;
}

type ItemConfigItem = { _id: string; name: string; unit: string; unit_price: number };
type CostEntry = { item_id: { _id: string } | null; quantity: number };
type GuestEntry = {
  _id: string;
  guest_name?: string;
  quantity: number;
  responsible_member_id: { _id: string; full_name: string } | null;
};
type ShareEntry = { member_id: string; full_name: string; units: number; amount: number };

type SettleData = {
  session: {
    _id: string;
    date: string;
    start_time: string;
    end_time: string;
    status: string;
    cost_settled_at?: string;
    pass_court_at?: string;
  };
  fixedCost: number;
  items: ItemConfigItem[];
  costs: CostEntry[];
  guests: GuestEntry[];
  presentCount: number;
  presentNames: string[];
  total: number;
  totalUnits: number;
  shares: ShareEntry[];
  settled: boolean;
};

export default function SettleSessionPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [data, setData] = useState<SettleData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState("");

  function load() {
    fetch(`/api/settle/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d: SettleData) => {
        setData(d);
        setNotFound(false);
        const initial: Record<string, number> = {};
        for (const c of d.costs) {
          if (c.item_id) initial[c.item_id._id] = c.quantity;
        }
        setQuantities(initial);
      })
      .catch(() => setNotFound(true));
  }

  useEffect(load, [id]);

  async function handleSaveItems() {
    setSaving(true);
    setError("");
    const items = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([item_id, quantity]) => ({ item_id, quantity }));
    const res = await fetch(`/api/sessions/${id}/costs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    setSaving(false);
    if (!res.ok) {
      const resData = await res.json().catch(() => ({}));
      setError(resData.error ?? "Lưu vật phẩm thất bại");
      return;
    }
    load();
  }

  async function handleSettle() {
    if (
      !window.confirm("Xác nhận quyết toán buổi tập này? Sau khi quyết toán sẽ gửi thông báo vào nhóm quản trị.")
    )
      return;
    setSettling(true);
    setError("");
    const res = await fetch(`/api/sessions/${id}/settle`, { method: "POST" });
    setSettling(false);
    if (!res.ok) {
      const resData = await res.json().catch(() => ({}));
      setError(resData.error ?? "Quyết toán thất bại");
      return;
    }
    load();
  }

  if (notFound) {
    return <p className="text-center text-sm text-zinc-500">Không tìm thấy buổi tập này.</p>;
  }
  if (!data) return <p className="text-sm text-zinc-400">Đang tải...</p>;

  const { session } = data;
  const isCancelled = session.status === "cancelled";
  const isPassCourt = !!session.pass_court_at;
  const isSettled = data.settled;
  const isNotEndedYet = new Date() < combineVNDateTime(session.date, session.end_time);
  const canEditItems = !isCancelled && !isPassCourt && !isSettled;
  const canSettle = canEditItems && !isNotEndedYet;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="font-medium">
            {formatSessionDate(session.date)} · {session.start_time}-{session.end_time}
          </p>
          <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600">
            {isSettled ? "Đã quyết toán" : isCancelled ? "Đã huỷ" : isPassCourt ? "Đã pass sân" : "Chưa quyết toán"}
          </span>
        </div>
      </div>

      {isCancelled ? (
        <p className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
          Buổi tập này đã bị huỷ — chi phí cố định đã được tự động chia đều cho tất cả thành viên khi huỷ.
        </p>
      ) : isPassCourt ? (
        <p className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
          Buổi tập này đã pass sân — không có chi phí để quyết toán.
        </p>
      ) : (
        <>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <h3 className="mb-2 text-xs font-semibold text-zinc-700">Người tham gia</h3>
            <p className="text-sm text-zinc-600">
              {data.presentCount} thành viên có mặt
              {data.presentNames.length > 0 && `: ${data.presentNames.join(", ")}`}
            </p>
            {data.guests.length > 0 && (
              <p className="mt-1 text-sm text-zinc-600">
                Khách vãng lai:{" "}
                {data.guests
                  .map((g) => `${g.guest_name || "khách"} x${g.quantity} (${g.responsible_member_id?.full_name ?? "?"})`)
                  .join(", ")}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <h3 className="mb-2 text-xs font-semibold text-zinc-700">Chi phí</h3>
            <p className="mb-2 text-sm text-zinc-600">
              Chi phí cố định: <b>{data.fixedCost.toLocaleString("vi-VN")}đ</b>
            </p>
            {data.items.length === 0 ? (
              <p className="text-xs text-zinc-400">Chưa có danh mục vật phẩm.</p>
            ) : (
              data.items.map((item) => (
                <div key={item._id} className="flex items-center justify-between gap-2 py-1">
                  <span className="text-sm">
                    {item.name}{" "}
                    <span className="text-zinc-400">
                      ({item.unit_price.toLocaleString("vi-VN")}đ/{item.unit})
                    </span>
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={quantities[item._id] ?? ""}
                    onChange={(e) => setQuantities({ ...quantities, [item._id]: Number(e.target.value) })}
                    disabled={!canEditItems}
                    className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm disabled:bg-zinc-100 disabled:text-zinc-400"
                  />
                </div>
              ))
            )}
            {canEditItems && data.items.length > 0 && (
              <button
                onClick={handleSaveItems}
                disabled={saving}
                className="mt-2 rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              >
                {saving ? "Đang lưu..." : "Lưu vật phẩm"}
              </button>
            )}
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <h3 className="mb-2 text-xs font-semibold text-zinc-700">Chia tiền</h3>
            <p className="mb-2 text-sm text-zinc-600">
              Tổng chi phí: <b>{data.total.toLocaleString("vi-VN")}đ</b> ({data.totalUnits} suất)
            </p>
            <div className="flex flex-col gap-1">
              {data.shares.map((s) => (
                <div key={s.member_id} className="flex items-center justify-between text-sm">
                  <span>
                    {s.full_name} {s.units > 1 && <span className="text-xs text-zinc-400">×{s.units}</span>}
                  </span>
                  <span className="font-medium">{s.amount.toLocaleString("vi-VN")}đ</span>
                </div>
              ))}
              {data.shares.length === 0 && <p className="text-xs text-zinc-400">Chưa có ai tham gia.</p>}
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            onClick={handleSettle}
            disabled={!canSettle || settling}
            title={isNotEndedYet ? "Chỉ quyết toán được sau khi buổi tập kết thúc" : undefined}
            className={`w-full rounded-lg py-3 text-sm font-semibold disabled:cursor-not-allowed ${
              canSettle
                ? "bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                : "bg-zinc-100 text-zinc-400"
            }`}
          >
            {isSettled
              ? "Đã quyết toán ✓"
              : isNotEndedYet
                ? "Chưa thể quyết toán (buổi tập chưa kết thúc)"
                : settling
                  ? "Đang quyết toán..."
                  : "Quyết toán"}
          </button>
        </>
      )}
    </div>
  );
}
