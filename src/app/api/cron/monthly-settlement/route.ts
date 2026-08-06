import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getSettings } from "@/lib/models/Settings";
import { runDueMonthlySettlement } from "@/lib/session-actions";

// Job chốt sao kê tháng — 1 job global trên cron-job.org (không theo từng lịch tập, xem
// src/lib/cron-sync.ts), kích hoạt vào ngày settings.monthly_settlement_day mỗi tháng. Idempotent
// qua settings.last_monthly_settlement_run.
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const settings = await getSettings();
  await runDueMonthlySettlement(settings);

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString() });
}
