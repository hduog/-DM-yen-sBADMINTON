import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getSettings } from "@/lib/models/Settings";
import {
  ensureUpcomingSessions,
  reconcileDueAttendance,
  runDueMonthlySettlement,
  sendDueCostReminders,
  sendDuePolls,
} from "@/lib/session-actions";

// Endpoint duy nhất được cron ngoài (cron-job.org) gọi mỗi 1-5 phút — xem mục 1.1/6 thiết kế.
// Toàn bộ logic đọc lịch trình từ DB và tự quyết định "bây giờ có việc gì cần chạy không".
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const settings = await getSettings();

  await ensureUpcomingSessions(settings);
  await sendDuePolls(settings);
  await reconcileDueAttendance(settings);
  await sendDueCostReminders(settings);
  await runDueMonthlySettlement(settings);

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString() });
}
