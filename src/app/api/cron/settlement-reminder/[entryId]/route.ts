import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getSettings } from "@/lib/models/Settings";
import { findSessionForScheduleEntry, sendSettlementReminder } from "@/lib/session-actions";

// Được job cron-job.org của đúng 1 mục weekly_schedule gọi (xem src/lib/cron-sync.ts) — mỗi lịch
// tập có 1 job riêng, kích hoạt ở mốc "sau giờ kết thúc N phút" (settings.cost_survey_minutes_after).
// Idempotent qua cost_reminder_sent_at.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> }
) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { entryId } = await params;

  await connectDB();
  const settings = await getSettings();
  const entry = settings.weekly_schedule.id(entryId);
  if (!entry) {
    return NextResponse.json({ error: "Không tìm thấy lịch tập" }, { status: 404 });
  }

  const session = await findSessionForScheduleEntry(entry);
  if (!session) return NextResponse.json({ ok: true, skipped: "no-session" });

  await sendSettlementReminder(session, settings);

  return NextResponse.json({ ok: true, sessionId: session._id, sent: !!session.cost_reminder_sent_at });
}
