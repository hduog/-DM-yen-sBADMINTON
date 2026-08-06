import { connectDB } from "@/lib/mongodb";
import { ItemConfig, Member, MemberAdvance, MonthlyStatement, Session, SessionCost } from "@/lib/models";
import { getSettings } from "@/lib/models/Settings";
import { vnNow } from "@/lib/session-actions";

export type MonthlyCostPoint = { month: string; total: number };
export type CostBreakdownSlice = { name: string; value: number };
export type Debtor = { name: string; amount: number };

// Xu hướng chi phí theo tháng: lấy N tháng gần nhất đã có MonthlyStatement (đã chốt sổ),
// không nhất thiết là N tháng dương lịch gần nhất vì tháng hiện tại có thể chưa chốt.
export async function getMonthlyCostTrend(months = 6): Promise<MonthlyCostPoint[]> {
  await connectDB();

  const rows = await MonthlyStatement.aggregate<{ _id: string; total: number }>([
    { $group: { _id: "$month", total: { $sum: "$total_amount" } } },
    { $sort: { _id: -1 } },
    { $limit: months },
  ]);

  return rows.map((r) => ({ month: r._id, total: r.total })).sort((a, b) => a.month.localeCompare(b.month));
}

// Cơ cấu chi phí tháng hiện tại: gộp SessionCost theo item cho các buổi đã quyết toán trong tháng,
// cộng thêm 1 khoản "Chi phí cố định" = số buổi × fixed_cost_per_session.
export async function getCurrentMonthCostBreakdown(): Promise<CostBreakdownSlice[]> {
  await connectDB();

  const settings = await getSettings();
  const now = vnNow();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const settledSessions = await Session.find({
    date: { $gte: monthStart, $lt: monthEnd },
    cost_settled_at: { $exists: true },
  });
  if (settledSessions.length === 0) return [];

  const costRows = await SessionCost.aggregate<{ _id: string; total: number }>([
    { $match: { session_id: { $in: settledSessions.map((s) => s._id) } } },
    { $group: { _id: "$item_id", total: { $sum: "$total_amount" } } },
  ]);

  const items = await ItemConfig.find({ _id: { $in: costRows.map((c) => c._id) } });
  const nameById = new Map(items.map((i) => [i._id.toString(), i.name as string]));

  const slices: CostBreakdownSlice[] = costRows.map((c) => ({
    name: nameById.get(c._id.toString()) ?? "Khác",
    value: c.total,
  }));

  const fixedTotal = settledSessions.length * (settings.fixed_cost_per_session ?? 0);
  if (fixedTotal > 0) slices.push({ name: "Chi phí cố định", value: fixedTotal });

  return slices.sort((a, b) => b.value - a.value);
}

// Top thành viên còn nợ tiền: gộp MonthlyStatement chưa approved theo member, sắp giảm dần.
export async function getTopDebtors(limit = 8): Promise<Debtor[]> {
  await connectDB();

  const rows = await MonthlyStatement.aggregate<{ _id: string; amount: number }>([
    { $match: { status: { $in: ["pending", "paid_reported"] } } },
    { $group: { _id: "$member_id", amount: { $sum: "$total_amount" } } },
    { $match: { amount: { $gt: 0 } } },
    { $sort: { amount: -1 } },
    { $limit: limit },
  ]);
  if (rows.length === 0) return [];

  const members = await Member.find({ _id: { $in: rows.map((r) => r._id) }, del_flag: { $ne: true } });
  const nameById = new Map(members.map((m) => [m._id.toString(), m.full_name as string]));

  return rows
    .filter((r) => nameById.has(r._id.toString()))
    .map((r) => ({ name: nameById.get(r._id.toString())!, amount: r.amount }));
}

// Khoản chi trước (VD cọc sân) đang còn giữ (chưa đến ngày quyết toán tháng để trừ/hoàn) theo
// từng thành viên — sắp giảm dần, cùng shape với getTopDebtors để tái dùng chung DebtorsChart.
export async function getOutstandingAdvances(limit = 8): Promise<Debtor[]> {
  await connectDB();

  const rows = await MemberAdvance.aggregate<{ _id: string; amount: number }>([
    { $match: { status: "open" } },
    { $group: { _id: "$member_id", amount: { $sum: "$amount" } } },
    { $match: { amount: { $gt: 0 } } },
    { $sort: { amount: -1 } },
    { $limit: limit },
  ]);
  if (rows.length === 0) return [];

  const members = await Member.find({ _id: { $in: rows.map((r) => r._id) }, del_flag: { $ne: true } });
  const nameById = new Map(members.map((m) => [m._id.toString(), m.full_name as string]));

  return rows
    .filter((r) => nameById.has(r._id.toString()))
    .map((r) => ({ name: nameById.get(r._id.toString())!, amount: r.amount }));
}
