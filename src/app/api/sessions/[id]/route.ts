import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Session } from "@/lib/models";
import { getSettings } from "@/lib/models/Settings";
import { requireAdmin } from "@/lib/auth-guard";
import { formatVNDate, getSessionCostUnits, settleSessionCost, syncQuotaStatus } from "@/lib/session-actions";
import { sendMessage } from "@/lib/telegram";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || (body.notes === undefined && body.status === undefined && body.min_required === undefined)) {
    return NextResponse.json({ error: "Payload không hợp lệ" }, { status: 400 });
  }
  if (body.status !== undefined && body.status !== "cancelled") {
    return NextResponse.json({ error: "Chỉ hỗ trợ hủy buổi tập qua API này" }, { status: 400 });
  }
  if (body.min_required !== undefined && (!Number.isInteger(body.min_required) || body.min_required < 1)) {
    return NextResponse.json({ error: "Số người tối thiểu không hợp lệ" }, { status: 400 });
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

  let currentTotalUnits = 0;
  if (body.min_required !== undefined) {
    currentTotalUnits = (await getSessionCostUnits(session._id.toString())).totalUnits;
    if (body.min_required < currentTotalUnits) {
      return NextResponse.json(
        {
          error: `Không thể giảm số người tối thiểu xuống dưới số người đã điểm danh tham gia hiện tại (${currentTotalUnits}).`,
        },
        { status: 400 }
      );
    }
  }

  if (body.notes !== undefined) session.notes = body.notes;
  if (body.status !== undefined) session.status = body.status;
  if (body.min_required !== undefined) session.min_required = body.min_required;
  await session.save();

  const settings = await getSettings();

  if (body.status === "cancelled") {
    const result = await settleSessionCost(session, settings);

    const dateLabel = `${formatVNDate(session.date)} (${session.start_time}-${session.end_time})`;
    const feeNote =
      result && result.total > 0
        ? ` Chi phí cố định ${result.total.toLocaleString("vi-VN")}đ đã được chia đều vào sao kê các thành viên.`
        : "";
    const text = `🚫 Buổi tập ${dateLabel} đã bị huỷ.${feeNote}`;
    if (settings.main_group_chat_id) await sendMessage(settings.main_group_chat_id, text);
    if (settings.admin_group_chat_id) await sendMessage(settings.admin_group_chat_id, text);
  } else if (body.min_required !== undefined) {
    await syncQuotaStatus(session, settings, currentTotalUnits);
  }

  return NextResponse.json(session);
}
