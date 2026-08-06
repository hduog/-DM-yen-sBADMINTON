import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { ItemConfig, Member, Session, SessionCost, SessionGuest, SessionMemberCost } from "@/lib/models";
import { getSettings } from "@/lib/models/Settings";
import { requireAdmin } from "@/lib/auth-guard";
import { getSessionAttendanceDetail, getSessionCostUnits } from "@/lib/session-actions";

// Dùng bởi trang /settle/[id] (mở qua link nhắc quyết toán trong nhóm quản trị — xem
// sendDueSettlementReminders). Chỉ đọc dữ liệu; sửa vật phẩm vẫn đi qua /api/sessions/[id]/costs
// và bấm Quyết toán vẫn đi qua /api/sessions/[id]/settle (đã có sẵn) để không lặp logic tính tiền.
// Trước khi quyết toán: trả về preview chia tiền theo suất hiện tại (không lưu). Sau khi quyết
// toán: trả về đúng số đã chốt trong SessionMemberCost.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  await connectDB();

  const session = await Session.findById(id);
  if (!session) return NextResponse.json({ error: "Không tìm thấy buổi tập" }, { status: 404 });

  const settings = await getSettings();
  const fixedCost = settings.fixed_cost_per_session ?? 0;

  const [items, costs, guests, detail] = await Promise.all([
    ItemConfig.find().sort({ name: 1 }),
    SessionCost.find({ session_id: id }).populate<{
      item_id: { _id: string; name: string; unit: string; unit_price: number } | null;
    }>("item_id", "name unit unit_price"),
    SessionGuest.find({ session_id: id }).populate<{
      responsible_member_id: { _id: string; full_name: string } | null;
    }>("responsible_member_id", "full_name"),
    getSessionAttendanceDetail(id),
  ]);

  let shares: { member_id: string; full_name: string; units: number; amount: number }[] = [];
  let total = 0;
  let totalUnits = 0;

  if (session.cost_settled_at) {
    const records = await SessionMemberCost.find({ session_id: id }).populate<{
      member_id: { _id: string; full_name: string } | null;
    }>("member_id", "full_name");
    shares = records
      .filter((r) => r.member_id)
      .map((r) => ({
        member_id: r.member_id!._id.toString(),
        full_name: r.member_id!.full_name,
        units: r.units,
        amount: r.amount,
      }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
    total = shares.reduce((sum, s) => sum + s.amount, 0);
    totalUnits = shares.reduce((sum, s) => sum + s.units, 0);
  } else if (session.status === "cancelled") {
    total = fixedCost;
    const activeMembers = await Member.find({ status: "active", del_flag: { $ne: true } }).sort({ full_name: 1 });
    totalUnits = activeMembers.length;
    const perUnit = totalUnits > 0 ? total / totalUnits : 0;
    shares = activeMembers.map((m) => ({
      member_id: m._id.toString(),
      full_name: m.full_name,
      units: 1,
      amount: Math.round(perUnit),
    }));
  } else {
    const { unitsByMember, totalUnits: units } = await getSessionCostUnits(id);
    totalUnits = units;
    total = costs.reduce((sum, c) => sum + c.total_amount, 0) + fixedCost;
    const perUnit = totalUnits > 0 ? total / totalUnits : 0;

    const memberIds = [...unitsByMember.keys()];
    const members = await Member.find({ _id: { $in: memberIds } });
    const memberById = new Map(members.map((m) => [m._id.toString(), m]));
    shares = memberIds
      .map((mid) => ({
        member_id: mid,
        full_name: memberById.get(mid)?.full_name ?? "(?)",
        units: unitsByMember.get(mid)!,
        amount: Math.round(perUnit * unitsByMember.get(mid)!),
      }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }

  return NextResponse.json({
    session: {
      _id: session._id,
      date: session.date,
      start_time: session.start_time,
      end_time: session.end_time,
      status: session.status,
      cost_settled_at: session.cost_settled_at,
      pass_court_at: session.pass_court_at,
    },
    fixedCost,
    items,
    costs,
    guests,
    presentCount: detail.presentCount,
    presentNames: detail.list.filter((m) => m.answer === "present").map((m) => m.full_name),
    total,
    totalUnits,
    shares,
    settled: !!session.cost_settled_at,
  });
}
