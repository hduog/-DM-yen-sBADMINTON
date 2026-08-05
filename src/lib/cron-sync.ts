import { createCronJob, updateCronJob, deleteCronJob, type CronJobSchedule } from "@/lib/cronjob";
import type { SettingsDoc } from "@/lib/models/Settings";
import type { HydratedDocument } from "mongoose";

const WEEKDAY_LABEL = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const MINUTES_PER_WEEK = 7 * 24 * 60;

// Tính mốc kích hoạt job = giờ tập trừ đi "reminder_hours_before" tiếng, biểu diễn lại thành
// (thứ trong tuần, giờ, phút) để cấu hình schedule.wdays/hours/minutes của cron-job.org — xử lý
// đúng cả khi mốc này lùi qua nửa đêm hoặc lùi sang thứ trước đó.
export function computeTriggerSchedule(weekday: number, startTime: string, hoursBefore: number) {
  const [h, m] = startTime.split(":").map(Number);
  const startMinutes = weekday * 1440 + h * 60 + m;
  const triggerMinutes = ((startMinutes - hoursBefore * 60) % MINUTES_PER_WEEK + MINUTES_PER_WEEK) % MINUTES_PER_WEEK;

  return {
    wday: Math.floor(triggerMinutes / 1440),
    hour: Math.floor((triggerMinutes % 1440) / 60),
    minute: triggerMinutes % 60,
  };
}

type RemovedEntry = { cronjob_id?: number | null };

// Đồng bộ 1 job cron-job.org / lịch tập với weekly_schedule hiện tại — gọi sau mỗi lần lưu settings.
// Không throw khi thiếu cấu hình hoặc lỗi API — trả về warnings để route quyết định hiển thị cho admin.
export async function syncAttendanceCronJobs(
  settings: HydratedDocument<SettingsDoc>,
  removedEntries: RemovedEntry[]
): Promise<{ warnings: string[] }> {
  const warnings: string[] = [];

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const cronSecret = process.env.CRON_SECRET;

  if (!process.env.CRONJOB_API_KEY) {
    warnings.push("Chưa cấu hình CRONJOB_API_KEY — bỏ qua đồng bộ job điểm danh trên cron-job.org.");
    return { warnings };
  }
  if (!appUrl || !cronSecret) {
    warnings.push("Thiếu NEXT_PUBLIC_APP_URL hoặc CRON_SECRET — không thể đồng bộ job điểm danh.");
    return { warnings };
  }

  for (const removed of removedEntries) {
    if (!removed.cronjob_id) continue;
    try {
      await deleteCronJob(removed.cronjob_id);
    } catch (err) {
      warnings.push(`Không xoá được job cũ #${removed.cronjob_id}: ${(err as Error).message}`);
    }
  }

  for (const entry of settings.weekly_schedule) {
    const trigger = computeTriggerSchedule(entry.weekday, entry.start_time, settings.reminder_hours_before);
    const schedule: CronJobSchedule = {
      timezone: "Asia/Ho_Chi_Minh",
      hours: [trigger.hour],
      minutes: [trigger.minute],
      mdays: [-1],
      months: [-1],
      wdays: [trigger.wday],
    };
    const spec = {
      title: `[YenCLB] Diem danh ${WEEKDAY_LABEL[entry.weekday]} ${entry.start_time}`,
      url: `${appUrl}/api/cron/attendance/${entry._id}`,
      bearerSecret: cronSecret,
      schedule,
    };

    try {
      if (!entry.cronjob_id) {
        entry.cronjob_id = await createCronJob(spec);
      } else {
        await updateCronJob(entry.cronjob_id, spec);
      }
    } catch (err) {
      warnings.push(`Lỗi đồng bộ job "${spec.title}": ${(err as Error).message}`);
    }
  }

  await settings.save();
  return { warnings };
}
