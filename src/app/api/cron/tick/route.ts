import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getSettings } from "@/lib/models/Settings";
import { reconcileDueAttendance, runDueMonthlySettlement } from "@/lib/session-actions";

// Gọi mỗi 1-5 phút bởi cron ngoài (cron-job.org) — xem mục 1.1/6 thiết kế. Việc tạo Session + gửi
// thông báo điểm danh/"đang diễn ra"/nhắc quyết toán không đi qua tick này — mỗi lịch tập có 1 job
// riêng gọi thẳng đúng giờ (/api/cron/attendance, /session-start, /settlement-reminder — xem
// src/lib/cron-sync.ts). Tick này chỉ còn lo phần chưa có mốc giờ cố định theo từng lịch tập: chốt
// thiếu người ở T-5h, chốt sao kê tháng.
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const settings = await getSettings();

  await reconcileDueAttendance(settings);
  await runDueMonthlySettlement(settings);

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString() });
}
