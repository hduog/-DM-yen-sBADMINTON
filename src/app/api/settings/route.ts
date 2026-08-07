import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getSettings } from "@/lib/models/Settings";
import { requireAdmin } from "@/lib/auth-guard";
import { syncAttendanceCronJobs, syncDailySummaryCronJob, syncMonthlySettlementCronJob } from "@/lib/cron-sync";
import {
  runAttendanceJobIfDue,
  runDueMonthlySettlement,
  runSessionStartJobIfDue,
  runSettlementReminderJobIfDue,
} from "@/lib/session-actions";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  await connectDB();
  const settings = await getSettings();
  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Payload không hợp lệ" }, { status: 400 });

  await connectDB();
  const settings = await getSettings();

  // Snapshot trước khi ghi đè weekly_schedule — cần để biết mục nào bị xoá (và cronjob_id của nó)
  // nhằm xoá đúng job tương ứng trên cron-job.org sau khi lưu.
  const oldEntries: {
    id: string;
    cronjob_id?: number;
    start_notice_cronjob_id?: number;
    settlement_cronjob_id?: number;
  }[] = settings.weekly_schedule.map(
    (e: {
      _id: { toString(): string };
      cronjob_id?: number;
      start_notice_cronjob_id?: number;
      settlement_cronjob_id?: number;
    }) => ({
      id: e._id.toString(),
      cronjob_id: e.cronjob_id,
      start_notice_cronjob_id: e.start_notice_cronjob_id,
      settlement_cronjob_id: e.settlement_cronjob_id,
    })
  );

  const editableFields = [
    "club_name",
    "main_group_chat_id",
    "admin_group_chat_id",
    "bot_username",
    "weekly_schedule",
    "required_participants",
    "fixed_cost_per_session",
    "reminder_hours_before",
    "cost_survey_minutes_after",
    "monthly_settlement_day",
    "daily_summary_time",
  ] as const;

  for (const field of editableFields) {
    if (field in body) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (settings as any)[field] = body[field];
    }
  }

  await settings.save();

  const newIds = new Set(
    settings.weekly_schedule.map((e: { _id: { toString(): string } }) => e._id.toString())
  );
  const removedEntries = oldEntries.filter((e) => !newIds.has(e.id));
  const { warnings } = await syncAttendanceCronJobs(settings, removedEntries);

  const { warnings: monthlyWarnings } = await syncMonthlySettlementCronJob(settings);
  warnings.push(...monthlyWarnings);

  const { warnings: dailySummaryWarnings } = await syncDailySummaryCronJob(settings);
  warnings.push(...dailySummaryWarnings);

  for (const entry of settings.weekly_schedule) {
    try {
      await runAttendanceJobIfDue(entry, settings);
    } catch (err) {
      warnings.push(`Lỗi chạy bù job điểm danh cho lịch ${entry.start_time}: ${(err as Error).message}`);
    }
    try {
      await runSessionStartJobIfDue(entry, settings);
    } catch (err) {
      warnings.push(`Lỗi chạy bù job "đang diễn ra" cho lịch ${entry.start_time}: ${(err as Error).message}`);
    }
    try {
      await runSettlementReminderJobIfDue(entry, settings);
    } catch (err) {
      warnings.push(`Lỗi chạy bù job nhắc quyết toán cho lịch ${entry.start_time}: ${(err as Error).message}`);
    }
  }

  try {
    await runDueMonthlySettlement(settings);
  } catch (err) {
    warnings.push(`Lỗi chạy bù chốt sao kê tháng: ${(err as Error).message}`);
  }

  return NextResponse.json({ ...settings.toObject(), warnings });
}
