import { Member, Session, SessionCost, SessionMemberCost } from "@/lib/models";
import { getSettings } from "@/lib/models/Settings";
import { combineVNDateTime, getEffectiveFixedCost, getSessionCostUnits } from "@/lib/session-actions";

// Xuất sao kê 1 tháng ra CSV (mở được bằng Excel/Google Sheets): mỗi dòng = 1 thành viên trong 1
// buổi tập, suất khách vãng lai đã cộng vào người chịu trách nhiệm (giống getSessionCostUnits).
// Buổi đã quyết toán lấy đúng số đã chốt trong SessionMemberCost; buổi đã kết thúc nhưng chưa quyết
// toán (và chưa pass sân) thì tạm tính theo cùng công thức settleSessionCost để admin thấy trước.
// Cuối file là bảng tổng kết: mỗi người cần trả bao nhiêu + tổng cả đội.

const WEEKDAY_LABEL = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

type ExportRow = {
  date: string;
  time: string;
  memberId: string;
  memberName: string;
  units: number;
  items: string;
  itemsCost: number;
  fixedCost: number;
  sessionTotal: number;
  amount: number;
  status: string;
};

function formatDate(date: Date) {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${WEEKDAY_LABEL[date.getUTCDay()]} ${dd}/${mm}/${date.getUTCFullYear()}`;
}

function csvCell(value: string | number) {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function buildMonthlyStatementCsv(year: number, month: number) {
  const settings = await getSettings();
  const sessions = await Session.find({
    date: { $gte: new Date(Date.UTC(year, month - 1, 1)), $lt: new Date(Date.UTC(year, month, 1)) },
  }).sort({ date: 1, start_time: 1 });

  const rows: ExportRow[] = [];
  const now = new Date();

  for (const session of sessions) {
    const settled = !!session.cost_settled_at;
    // Buổi chưa quyết toán: chỉ tạm tính khi đã kết thúc, chưa huỷ (huỷ thì tự quyết toán ngay) và
    // chưa pass sân (pass sân thì không phát sinh chi phí).
    if (!settled) {
      if (session.status === "cancelled" || session.pass_court_at) continue;
      if (now < combineVNDateTime(session.date, session.end_time)) continue;
    }

    const isCancelled = session.status === "cancelled";
    const fixedCost = getEffectiveFixedCost(session, settings);
    const costs = isCancelled
      ? []
      : await SessionCost.find({ session_id: session._id }).populate<{
          item_id: { name: string; unit: string; unit_price: number } | null;
        }>("item_id", "name unit unit_price");
    const itemsCost = costs.reduce((sum, c) => sum + c.total_amount, 0);
    const items = isCancelled
      ? "(buổi huỷ - chỉ tính tiền sân)"
      : costs
          .filter((c) => c.item_id)
          .map(
            (c) =>
              `${c.item_id!.name} x${c.quantity} ${c.item_id!.unit} @ ${c.item_id!.unit_price.toLocaleString("vi-VN")}đ = ${c.total_amount.toLocaleString("vi-VN")}đ`
          )
          .join("; ");

    let shares: { memberId: string; units: number; amount: number }[];
    if (settled) {
      const records = await SessionMemberCost.find({ session_id: session._id });
      shares = records.map((r) => ({ memberId: r.member_id.toString(), units: r.units, amount: r.amount }));
    } else {
      const { unitsByMember, totalUnits } = await getSessionCostUnits(session._id.toString());
      const perUnit = totalUnits > 0 ? (itemsCost + fixedCost) / totalUnits : 0;
      shares = [...unitsByMember].map(([memberId, units]) => ({
        memberId,
        units,
        amount: Math.round(perUnit * units),
      }));
    }
    if (shares.length === 0) continue;

    const members = await Member.find({ _id: { $in: shares.map((s) => s.memberId) } }, "full_name");
    const nameById = new Map(members.map((m) => [m._id.toString(), m.full_name as string]));
    const status = settled ? (isCancelled ? "Đã huỷ" : "Đã quyết toán") : "Chưa quyết toán (tạm tính)";

    for (const share of shares.sort((a, b) =>
      (nameById.get(a.memberId) ?? "").localeCompare(nameById.get(b.memberId) ?? "")
    )) {
      rows.push({
        date: formatDate(session.date),
        time: `${session.start_time}-${session.end_time}`,
        memberId: share.memberId,
        memberName: nameById.get(share.memberId) ?? "(đã xoá)",
        units: share.units,
        items,
        itemsCost,
        fixedCost,
        sessionTotal: (isCancelled ? 0 : itemsCost) + fixedCost,
        amount: share.amount,
        status,
      });
    }
  }

  const monthLabel = `${String(month).padStart(2, "0")}/${year}`;
  const lines: (string | number)[][] = [
    [`SAO KÊ CHI PHÍ THÁNG ${monthLabel}`],
    [],
    [
      "Ngày",
      "Giờ",
      "Thành viên",
      "Số suất (gồm vãng lai)",
      "Vật phẩm",
      "Tiền vật phẩm",
      "Tiền sân cố định",
      "Tổng buổi",
      "Thành viên chịu",
      "Trạng thái",
    ],
    ...rows.map((r) => [
      r.date,
      r.time,
      r.memberName,
      r.units,
      r.items,
      r.itemsCost,
      r.fixedCost,
      r.sessionTotal,
      r.amount,
      r.status,
    ]),
  ];

  // Tổng kết theo thành viên — cộng đúng cột "Thành viên chịu" ở trên để 2 bảng luôn khớp nhau.
  const summary = new Map<string, { name: string; sessions: number; units: number; amount: number }>();
  for (const r of rows) {
    const s = summary.get(r.memberId) ?? { name: r.memberName, sessions: 0, units: 0, amount: 0 };
    s.sessions += 1;
    s.units += r.units;
    s.amount += r.amount;
    summary.set(r.memberId, s);
  }
  const teamTotal = rows.reduce((sum, r) => sum + r.amount, 0);

  lines.push(
    [],
    [`TỔNG KẾT THÁNG ${monthLabel}`],
    ["Thành viên", "Số buổi", "Tổng suất", "Cần trả"],
    ...[...summary.values()]
      .sort((a, b) => b.amount - a.amount)
      .map((s) => [s.name, s.sessions, s.units, s.amount]),
    ["CẢ ĐỘI", "", "", teamTotal]
  );

  // BOM UTF-8 để Excel nhận đúng tiếng Việt khi mở trực tiếp file CSV.
  const csv = "﻿" + lines.map((line) => line.map(csvCell).join(",")).join("\r\n");
  const fileName = `sao-ke-${year}-${String(month).padStart(2, "0")}.csv`;
  return { csv, fileName, rowCount: rows.length, teamTotal };
}
