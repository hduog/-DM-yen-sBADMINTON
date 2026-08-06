import { createCronJob, updateCronJob, deleteCronJob, type CronJobSchedule } from "@/lib/cronjob";
import type { SettingsDoc } from "@/lib/models/Settings";
import type { HydratedDocument } from "mongoose";

const WEEKDAY_LABEL = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const MINUTES_PER_WEEK = 7 * 24 * 60;
// Giờ trong ngày chạy job chốt sao kê tháng (chưa có field cấu hình riêng cho giờ này, chỉ có
// monthly_settlement_day) — chọn giờ hành chính buổi sáng thay vì đúng 00:00 để tin nhắn không
// đến vào lúc nửa đêm.
const MONTHLY_SETTLEMENT_HOUR = 8;

// Tính mốc kích hoạt job = giờ tập trừ đi "reminder_hours_before" tiếng, biểu diễn lại thành
// (thứ trong tuần, giờ, phút) để cấu hình schedule.wdays/hours/minutes của cron-job.org — xử lý
// đúng cả khi mốc này lùi qua nửa đêm hoặc lùi sang thứ trước đó.
export function computeTriggerSchedule(weekday: number, startTime: string, hoursBefore: number) {
  return computeTriggerScheduleOffset(weekday, startTime, -hoursBefore * 60);
}

// Tổng quát hoá computeTriggerSchedule: cộng thẳng offsetMinutes (âm = trước, dương = sau) vào
// (weekday, hh:mm) rồi quy đổi lại thành (thứ, giờ, phút) trong tuần — dùng cho job "nhắc quyết
// toán" (offset dương, sau giờ kết thúc) và job "đang diễn ra" (offset = 0, đúng giờ bắt đầu).
export function computeTriggerScheduleOffset(weekday: number, hhmm: string, offsetMinutes: number) {
  const [h, m] = hhmm.split(":").map(Number);
  const baseMinutes = weekday * 1440 + h * 60 + m;
  const triggerMinutes = ((baseMinutes + offsetMinutes) % MINUTES_PER_WEEK + MINUTES_PER_WEEK) % MINUTES_PER_WEEK;

  return {
    wday: Math.floor(triggerMinutes / 1440),
    hour: Math.floor((triggerMinutes % 1440) / 60),
    minute: triggerMinutes % 60,
  };
}

function toCronSchedule(trigger: { wday: number; hour: number; minute: number }): CronJobSchedule {
  return {
    timezone: "Asia/Ho_Chi_Minh",
    hours: [trigger.hour],
    minutes: [trigger.minute],
    mdays: [-1],
    months: [-1],
    wdays: [trigger.wday],
  };
}

type RemovedEntry = {
  cronjob_id?: number | null;
  start_notice_cronjob_id?: number | null;
  settlement_cronjob_id?: number | null;
};

// Đồng bộ 3 job cron-job.org / lịch tập với weekly_schedule hiện tại — gọi sau mỗi lần lưu settings:
// (1) điểm danh ở T-reminder_hours_before, (2) "đang diễn ra" đúng giờ bắt đầu, (3) nhắc quyết toán
// ở T+cost_survey_minutes_after sau giờ kết thúc. Không throw khi thiếu cấu hình hoặc lỗi API —
// trả về warnings để route quyết định hiển thị cho admin.
export async function syncAttendanceCronJobs(
  settings: HydratedDocument<SettingsDoc>,
  removedEntries: RemovedEntry[]
): Promise<{ warnings: string[] }> {
  const warnings: string[] = [];

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const cronSecret = process.env.CRON_SECRET;

  if (!process.env.CRONJOB_API_KEY) {
    warnings.push("Chưa cấu hình CRONJOB_API_KEY — bỏ qua đồng bộ job trên cron-job.org.");
    return { warnings };
  }
  if (!appUrl || !cronSecret) {
    warnings.push("Thiếu NEXT_PUBLIC_APP_URL hoặc CRON_SECRET — không thể đồng bộ job.");
    return { warnings };
  }

  for (const removed of removedEntries) {
    for (const jobId of [removed.cronjob_id, removed.start_notice_cronjob_id, removed.settlement_cronjob_id]) {
      if (!jobId) continue;
      try {
        await deleteCronJob(jobId);
      } catch (err) {
        warnings.push(`Không xoá được job cũ #${jobId}: ${(err as Error).message}`);
      }
    }
  }

  for (const entry of settings.weekly_schedule) {
    const attendanceSpec = {
      title: `[YenCLB] Diem danh ${WEEKDAY_LABEL[entry.weekday]} ${entry.start_time}`,
      url: `${appUrl}/api/cron/attendance/${entry._id}`,
      bearerSecret: cronSecret,
      schedule: toCronSchedule(
        computeTriggerSchedule(entry.weekday, entry.start_time, settings.reminder_hours_before)
      ),
    };
    try {
      if (!entry.cronjob_id) entry.cronjob_id = await createCronJob(attendanceSpec);
      else await updateCronJob(entry.cronjob_id, attendanceSpec);
    } catch (err) {
      warnings.push(`Lỗi đồng bộ job "${attendanceSpec.title}": ${(err as Error).message}`);
    }

    const startSpec = {
      title: `[YenCLB] Bat dau ${WEEKDAY_LABEL[entry.weekday]} ${entry.start_time}`,
      url: `${appUrl}/api/cron/session-start/${entry._id}`,
      bearerSecret: cronSecret,
      schedule: toCronSchedule(computeTriggerScheduleOffset(entry.weekday, entry.start_time, 0)),
    };
    try {
      if (!entry.start_notice_cronjob_id) entry.start_notice_cronjob_id = await createCronJob(startSpec);
      else await updateCronJob(entry.start_notice_cronjob_id, startSpec);
    } catch (err) {
      warnings.push(`Lỗi đồng bộ job "${startSpec.title}": ${(err as Error).message}`);
    }

    const settleSpec = {
      title: `[YenCLB] Quyet toan ${WEEKDAY_LABEL[entry.weekday]} ${entry.end_time}`,
      url: `${appUrl}/api/cron/settlement-reminder/${entry._id}`,
      bearerSecret: cronSecret,
      schedule: toCronSchedule(
        computeTriggerScheduleOffset(entry.weekday, entry.end_time, settings.cost_survey_minutes_after)
      ),
    };
    try {
      if (!entry.settlement_cronjob_id) entry.settlement_cronjob_id = await createCronJob(settleSpec);
      else await updateCronJob(entry.settlement_cronjob_id, settleSpec);
    } catch (err) {
      warnings.push(`Lỗi đồng bộ job "${settleSpec.title}": ${(err as Error).message}`);
    }
  }

  await settings.save();
  return { warnings };
}

// Đồng bộ job chốt sao kê tháng trên cron-job.org — KHÔNG theo từng lịch tập (weekly_schedule) mà
// là 1 job global duy nhất, kích hoạt vào ngày settings.monthly_settlement_day mỗi tháng lúc
// MONTHLY_SETTLEMENT_HOUR:00 giờ VN. Gọi sau mỗi lần lưu settings, cùng lúc với
// syncAttendanceCronJobs. Không throw khi thiếu cấu hình hoặc lỗi API — trả về warnings.
export async function syncMonthlySettlementCronJob(
  settings: HydratedDocument<SettingsDoc>
): Promise<{ warnings: string[] }> {
  const warnings: string[] = [];

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const cronSecret = process.env.CRON_SECRET;

  if (!process.env.CRONJOB_API_KEY) {
    warnings.push("Chưa cấu hình CRONJOB_API_KEY — bỏ qua đồng bộ job chốt sao kê tháng trên cron-job.org.");
    return { warnings };
  }
  if (!appUrl || !cronSecret) {
    warnings.push("Thiếu NEXT_PUBLIC_APP_URL hoặc CRON_SECRET — không thể đồng bộ job chốt sao kê tháng.");
    return { warnings };
  }

  const spec = {
    title: `[YenCLB] Chot sao ke thang (ngay ${settings.monthly_settlement_day})`,
    url: `${appUrl}/api/cron/monthly-settlement`,
    bearerSecret: cronSecret,
    schedule: {
      timezone: "Asia/Ho_Chi_Minh",
      hours: [MONTHLY_SETTLEMENT_HOUR],
      minutes: [0],
      mdays: [settings.monthly_settlement_day],
      months: [-1],
      wdays: [-1],
    },
  };

  try {
    if (!settings.monthly_settlement_cronjob_id) {
      settings.monthly_settlement_cronjob_id = await createCronJob(spec);
    } else {
      await updateCronJob(settings.monthly_settlement_cronjob_id, spec);
    }
    await settings.save();
  } catch (err) {
    warnings.push(`Lỗi đồng bộ job "${spec.title}": ${(err as Error).message}`);
  }

  return { warnings };
}
