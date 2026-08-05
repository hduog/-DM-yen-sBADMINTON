import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Session } from "@/lib/models";
import { getSettings } from "@/lib/models/Settings";
import { requireAdmin } from "@/lib/auth-guard";
import { formatVNDate, settleSessionCost } from "@/lib/session-actions";
import { sendMessage } from "@/lib/telegram";

// Nút "Quyết toán" — tính chi phí buổi tập (item * đơn giá + chi phí cố định), chia theo suất
// (tái dùng settleSessionCost) và cộng vào sao kê tháng chứa ngày đó. Idempotent qua
// cost_settled_at — bấm lại trên buổi đã quyết toán sẽ bị chặn ở đây, không cộng dồn 2 lần.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  await connectDB();

  const session = await Session.findById(id);
  if (!session) return NextResponse.json({ error: "Không tìm thấy buổi tập" }, { status: 404 });
  if (session.status === "cancelled") {
    return NextResponse.json(
      { error: "Buổi tập đã bị huỷ — chi phí cố định đã tự động chia khi huỷ" },
      { status: 400 }
    );
  }
  if (session.cost_settled_at) {
    return NextResponse.json({ error: "Buổi tập này đã được quyết toán" }, { status: 400 });
  }

  const settings = await getSettings();
  const result = await settleSessionCost(session, settings);

  if (settings.admin_group_chat_id && result) {
    const dateLabel = `${formatVNDate(session.date)} (${session.start_time}-${session.end_time})`;
    await sendMessage(
      settings.admin_group_chat_id,
      `🧮 Đã quyết toán buổi tập ${dateLabel}: tổng ${result.total.toLocaleString("vi-VN")}đ, ${result.totalUnits} người, đã cộng vào sao kê tháng ${result.month}.`
    );
  }

  return NextResponse.json({ ok: true, session, result: result ? { total: result.total, totalUnits: result.totalUnits, month: result.month } : null });
}
