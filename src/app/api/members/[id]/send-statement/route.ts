import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Member, MonthlyStatement } from "@/lib/models";
import { requireAdmin } from "@/lib/auth-guard";
import { sendMessage } from "@/lib/telegram";

// Gửi sao kê tháng đang filter vào Group chat riêng của thành viên — số tiền tính đến thời điểm
// hiện tại (dựa trên MonthlyStatement đã tích luỹ dần qua settleSessionCost, có thể chưa đầy đủ
// nếu tháng chưa kết thúc/còn buổi chưa quyết toán).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const month = Number(body?.month);
  const year = Number(body?.year);
  if (!month || !year) {
    return NextResponse.json({ error: "Thiếu tháng/năm" }, { status: 400 });
  }

  await connectDB();

  const member = await Member.findOne({ _id: id, del_flag: { $ne: true } });
  if (!member) return NextResponse.json({ error: "Không tìm thấy thành viên" }, { status: 404 });
  if (!member.statement_chat_id) {
    return NextResponse.json(
      { error: "Chưa cấu hình Group chat riêng cho thành viên này" },
      { status: 400 }
    );
  }

  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const statement = await MonthlyStatement.findOne({ member_id: id, month: monthKey });
  const totalAmount = statement?.total_amount ?? 0;
  const totalSessions = statement?.total_sessions ?? 0;

  await sendMessage(
    member.statement_chat_id,
    `📄 <b>Sao kê tháng ${monthKey}</b> (tính đến thời điểm hiện tại)\nSố buổi: ${totalSessions}\nSố tiền cần thanh toán: <b>${totalAmount.toLocaleString("vi-VN")}đ</b>`,
    statement
      ? {
          reply_markup: {
            inline_keyboard: [[{ text: "Tôi đã thanh toán", callback_data: `paid:${statement._id}` }]],
          },
        }
      : undefined
  );

  return NextResponse.json({ ok: true, totalAmount, totalSessions });
}
