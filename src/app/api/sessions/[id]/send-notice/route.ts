import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Session } from "@/lib/models";
import { getSettings } from "@/lib/models/Settings";
import { requireAdmin } from "@/lib/auth-guard";
import { sendAttendanceNoticeForSession } from "@/lib/session-actions";

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
  if (!settings.bot_username) {
    return NextResponse.json(
      { error: "Chưa cấu hình Username bot Telegram trong Cấu hình" },
      { status: 400 }
    );
  }

  await sendAttendanceNoticeForSession(session, settings);
  return NextResponse.json(session);
}
