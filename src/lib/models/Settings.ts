import { Schema, model, models, type InferSchemaType } from "mongoose";

const WeeklyScheduleEntrySchema = new Schema({
  weekday: { type: Number, required: true, min: 0, max: 6 }, // 0 = Chủ nhật ... 6 = Thứ 7
  start_time: { type: String, required: true }, // "HH:mm"
  end_time: { type: String, required: true }, // "HH:mm"
  // id của job trên cron-job.org tương ứng — dùng để update/xoá đúng job khi settings đổi.
  // _id (tự sinh, không tắt như trước) dùng làm định danh entry cho URL /api/cron/attendance/[entryId].
  cronjob_id: { type: Number },
  // id job "buổi tập đang diễn ra" (đúng giờ bắt đầu) — /api/cron/session-start/[entryId].
  start_notice_cronjob_id: { type: Number },
  // id job "nhắc quyết toán" (giờ kết thúc + cost_survey_minutes_after) — /api/cron/settlement-reminder/[entryId].
  settlement_cronjob_id: { type: Number },
});

const SettingsSchema = new Schema(
  {
    club_name: { type: String, default: "CLB" },
    main_group_chat_id: { type: Number },
    admin_group_chat_id: { type: Number },
    // Username bot Telegram (không kèm @) — dùng dựng deep link t.me/<bot_username>?startapp=...
    // để mở đúng Mini App kèm danh tính người bấm khi gửi link điểm danh vào group.
    bot_username: { type: String },
    weekly_schedule: { type: [WeeklyScheduleEntrySchema], default: [] },
    // Số người tham gia kỳ vọng mỗi buổi — dùng làm min_required mặc định khi tự tạo buổi từ
    // weekly_schedule, và làm mốc so sánh "đủ/thiếu người" ở trang Tổng quan.
    required_participants: { type: Number, default: 8 },
    // Chi phí cố định phát sinh mỗi buổi (thuê sân, ...) — cộng thêm vào tổng chi phí vật phẩm khi tính sao kê.
    fixed_cost_per_session: { type: Number, default: 0 },
    reminder_hours_before: { type: Number, default: 24 },
    cost_survey_minutes_after: { type: Number, default: 10 },
    monthly_settlement_day: { type: Number, default: 1, min: 1, max: 28 },
    // Đánh dấu "YYYY-MM" đã chốt sao kê rồi, tránh cron chạy trùng — xem mục 6/11 thiết kế
    last_monthly_settlement_run: { type: String },
  },
  { timestamps: true }
);

export type SettingsDoc = InferSchemaType<typeof SettingsSchema>;

const SettingsModel = models.Settings || model("Settings", SettingsSchema);

export async function getSettings() {
  let doc = await SettingsModel.findOne();
  if (!doc) {
    doc = await SettingsModel.create({});
  }
  return doc;
}

export default SettingsModel;
