import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Session } from "@/lib/models";
import { getSettings } from "@/lib/models/Settings";
import { requireAdmin } from "@/lib/auth-guard";
import { formatVNDate } from "@/lib/session-actions";
import { sendMessage } from "@/lib/telegram";

// Nút "Pass sân" — thuần thông báo vào nhóm chính rằng CLB không dùng sân buổi này, không đổi
// trạng thái buổi tập hay tiền bạc gì. Có thể bấm lại nhiều lần để nhắc lại nếu cần.
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

  const settings = await getSettings();
  if (!settings.main_group_chat_id) {
    return NextResponse.json(
      { error: "Chưa cấu hình chat_id nhóm chính trong Cấu hình" },
      { status: 400 }
    );
  }

  const dateLabel = `${formatVNDate(session.date)} (${session.start_time}-${session.end_time})`;
  await sendMessage(
    settings.main_group_chat_id,
    `🔄 CLB không sử dụng sân buổi tập ${dateLabel}. Ai cần sân giờ này liên hệ Ban quản trị để nhận lại.`
  );

  return NextResponse.json({ ok: true });
}
