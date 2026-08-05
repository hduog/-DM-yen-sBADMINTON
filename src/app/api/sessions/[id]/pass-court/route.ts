import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Session } from "@/lib/models";
import { getSettings } from "@/lib/models/Settings";
import { requireAdmin } from "@/lib/auth-guard";
import { formatVNDate } from "@/lib/session-actions";
import { sendMessage } from "@/lib/telegram";

// Nút "Pass sân" — thông báo vào nhóm chính rằng CLB không dùng sân buổi này, đồng thời khoá buổi
// tập lại (giống hủy/quyết toán): không còn gì để điểm danh/chi phí cho buổi đã pass, nên chỉ bấm
// được 1 lần — muốn làm lại thì dùng nút Reset.
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
  if (session.cost_settled_at || session.pass_court_at || session.status === "cancelled") {
    return NextResponse.json(
      { error: "Buổi tập đã quyết toán, đã huỷ, hoặc đã pass sân — không thể chỉnh sửa" },
      { status: 400 }
    );
  }

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

  session.pass_court_at = new Date();
  await session.save();

  return NextResponse.json(session);
}
