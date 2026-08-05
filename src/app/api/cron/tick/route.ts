import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getSettings } from "@/lib/models/Settings";
import {
  reconcileDueAttendance,
  runDueMonthlySettlement,
  sendDueCostReminders,
} from "@/lib/session-actions";

// Gọi mỗi 1-5 phút bởi cron ngoài (cron-job.org) — xem mục 1.1/6 thiết kế. Việc tạo Session +
// gửi poll điểm danh không còn đi qua tick này nữa, mỗi lịch tập có 1 job riêng gọi thẳng
// /api/cron/attendance/[entryId] đúng giờ (xem src/lib/cron-sync.ts). Tick này chỉ còn lo phần
// chưa có job riêng: chốt thiếu người ở T-5h, nhắc chi phí, chốt sao kê tháng.
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const settings = await getSettings();

  await reconcileDueAttendance(settings);
  await sendDueCostReminders(settings);
  await runDueMonthlySettlement(settings);

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString() });
}
