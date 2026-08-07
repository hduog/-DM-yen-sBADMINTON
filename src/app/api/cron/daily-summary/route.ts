import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getSettings } from "@/lib/models/Settings";
import { sendMessage } from "@/lib/telegram";
import { ensureUpcomingSessionForMainGroup, formatVNDate, getSessionAttendanceDetail } from "@/lib/session-actions";

// Job tóm tắt điểm danh hàng ngày — 1 job global trên cron-job.org (không theo từng lịch tập, xem
// src/lib/cron-sync.ts), chạy mọi ngày trong tuần lúc settings.daily_summary_time. Suy buổi tập sắp
// tới trực tiếp từ weekly_schedule (tự tạo Session nếu chưa có, xem
// ensureUpcomingSessionForMainGroup) rồi gửi đúng nội dung như lệnh /diemdanh vào nhóm chính.
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const settings = await getSettings();
  if (!settings.main_group_chat_id) return NextResponse.json({ ok: true, skipped: "no_main_group" });

  const session = await ensureUpcomingSessionForMainGroup(settings);
  if (!session || session.status === "cancelled") {
    return NextResponse.json({ ok: true, skipped: "no_upcoming_session" });
  }

  const detail = await getSessionAttendanceDetail(session._id.toString());
  const dateLabel = `${formatVNDate(session.date)} (${session.start_time}-${session.end_time})`;
  const presentNames = detail.list.filter((m) => m.answer === "present").map((m) => m.full_name);
  const absentNames = detail.list.filter((m) => m.answer === "absent").map((m) => m.full_name);
  const pendingNames = detail.list.filter((m) => m.answer === "no_response").map((m) => m.full_name);

  const lines = [
    `📋 Tóm tắt điểm danh buổi tập ${dateLabel}`,
    "",
    `✅ Tham gia (${presentNames.length}): ${presentNames.length > 0 ? presentNames.join(", ") : "(chưa ai)"}`,
    `❌ Không tham gia (${absentNames.length}): ${absentNames.length > 0 ? absentNames.join(", ") : "(chưa ai)"}`,
    `⏳ Chưa điểm danh (${pendingNames.length}): ${pendingNames.length > 0 ? pendingNames.join(", ") : "(không ai)"}`,
  ];

  await sendMessage(settings.main_group_chat_id, lines.join("\n"));

  return NextResponse.json({ ok: true, sessionId: session._id.toString() });
}
