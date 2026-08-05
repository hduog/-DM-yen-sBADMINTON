import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Session } from "@/lib/models";
import { getSettings } from "@/lib/models/Settings";
import { requireAdmin } from "@/lib/auth-guard";
import { sendMessage } from "@/lib/telegram";
import { formatVNDate, getSessionAttendanceDetail } from "@/lib/session-actions";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const detail = await getSessionAttendanceDetail(id);
  const dateLabel = `${formatVNDate(session.date)} (${session.start_time}-${session.end_time})`;
  const pending = detail.list.filter((m) => m.answer === "no_response");

  const text =
    pending.length > 0
      ? `🔔 Nhắc điểm danh buổi tập ${dateLabel}: ${pending
          .map((m) => m.full_name)
          .join(", ")} chưa điểm danh, vào poll bình chọn nhé!`
      : `🔔 Buổi tập ${dateLabel}: mọi người đã điểm danh đầy đủ 🎉`;

  await sendMessage(settings.main_group_chat_id, text);

  return NextResponse.json({ ok: true, noResponseCount: pending.length });
}
