import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Session } from "@/lib/models";
import { getSettings } from "@/lib/models/Settings";
import { requireAdmin } from "@/lib/auth-guard";
import { formatVNDate, settleSessionCost } from "@/lib/session-actions";
import { sendMessage } from "@/lib/telegram";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || (body.notes === undefined && body.status === undefined)) {
    return NextResponse.json({ error: "Payload không hợp lệ" }, { status: 400 });
  }
  if (body.status !== undefined && body.status !== "cancelled") {
    return NextResponse.json({ error: "Chỉ hỗ trợ hủy buổi tập qua API này" }, { status: 400 });
  }

  await connectDB();
  const session = await Session.findById(id);
  if (!session) return NextResponse.json({ error: "Không tìm thấy buổi tập" }, { status: 404 });

  if (body.status === "cancelled" && session.status === "cancelled") {
    return NextResponse.json({ error: "Buổi tập đã bị huỷ trước đó" }, { status: 400 });
  }
  if (session.cost_settled_at || session.pass_court_at) {
    return NextResponse.json({ error: "Buổi tập đã quyết toán hoặc đã pass sân, không thể chỉnh sửa" }, { status: 400 });
  }

  if (body.notes !== undefined) session.notes = body.notes;
  if (body.status !== undefined) session.status = body.status;
  await session.save();

  if (body.status === "cancelled") {
    const settings = await getSettings();
    const result = await settleSessionCost(session, settings);

    const dateLabel = `${formatVNDate(session.date)} (${session.start_time}-${session.end_time})`;
    const feeNote =
      result && result.total > 0
        ? ` Chi phí cố định ${result.total.toLocaleString("vi-VN")}đ đã được chia đều vào sao kê các thành viên.`
        : "";
    const text = `🚫 Buổi tập ${dateLabel} đã bị huỷ.${feeNote}`;
    if (settings.main_group_chat_id) await sendMessage(settings.main_group_chat_id, text);
    if (settings.admin_group_chat_id) await sendMessage(settings.admin_group_chat_id, text);
  }

  return NextResponse.json(session);
}
