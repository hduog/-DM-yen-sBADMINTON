import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Session, SessionMemberCost } from "@/lib/models";
import { requireAdmin } from "@/lib/auth-guard";

// Xem sao kê theo từng buổi tập (ngày X ai chịu bao nhiêu, tổng ngày đó) — khác với /api/statements
// vốn chỉ trả tổng gộp theo tháng. Dữ liệu lấy từ SessionMemberCost, được ghi tại thời điểm
// settleSessionCost() chạy (nút Quyết toán / tự động khi huỷ buổi / cron dọn cuối tháng).
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  await connectDB();

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");
  const year = searchParams.get("year");

  const query: Record<string, unknown> = { cost_settled_at: { $exists: true } };
  if (month && year) {
    const y = Number(year);
    const m = Number(month);
    query.date = { $gte: new Date(Date.UTC(y, m - 1, 1)), $lt: new Date(Date.UTC(y, m, 1)) };
  }

  const sessions = await Session.find(query).sort({ date: 1, start_time: 1 });

  const result = await Promise.all(
    sessions.map(async (session) => {
      const shares = await SessionMemberCost.find({ session_id: session._id }).populate(
        "member_id",
        "full_name"
      );
      const list = shares.map((s) => ({
        member_id: s.member_id._id,
        full_name: (s.member_id as unknown as { full_name: string }).full_name,
        amount: s.amount,
        units: s.units,
      }));
      return {
        session: {
          _id: session._id,
          date: session.date,
          start_time: session.start_time,
          end_time: session.end_time,
          status: session.status,
        },
        list,
        total: list.reduce((sum, s) => sum + s.amount, 0),
      };
    })
  );

  return NextResponse.json(result);
}
