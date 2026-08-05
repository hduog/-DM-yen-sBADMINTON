import { Schema, model, models, type InferSchemaType } from "mongoose";

const WeeklyScheduleEntrySchema = new Schema(
  {
    weekday: { type: Number, required: true, min: 0, max: 6 }, // 0 = Chủ nhật ... 6 = Thứ 7
    start_time: { type: String, required: true }, // "HH:mm"
    end_time: { type: String, required: true }, // "HH:mm"
  },
  { _id: false }
);

const SettingsSchema = new Schema(
  {
    club_name: { type: String, default: "CLB" },
    main_group_chat_id: { type: Number },
    admin_group_chat_id: { type: Number },
    weekly_schedule: { type: [WeeklyScheduleEntrySchema], default: [] },
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
