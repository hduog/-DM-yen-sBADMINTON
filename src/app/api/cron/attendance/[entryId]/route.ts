import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getSettings } from "@/lib/models/Settings";
import { ensureSessionForScheduleEntry, sendPollForSession } from "@/lib/session-actions";

// Được job cron-job.org của đúng 1 mục weekly_schedule gọi (xem src/lib/cron-sync.ts) — mỗi lịch
// tập có 1 job riêng, kích hoạt đúng vào mốc "trước giờ tập N tiếng". Idempotent qua poll_sent_at
// nên cron-job.org retry hay gọi trùng cũng không gửi poll lần 2.
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

  const session = await ensureSessionForScheduleEntry(entry, settings);
  if (!session.poll_sent_at) {
    await sendPollForSession(session, settings);
  }

  return NextResponse.json({ ok: true, sessionId: session._id, pollSent: !!session.poll_sent_at });
}
