import { Schema, model, models, type InferSchemaType } from "mongoose";

const SessionSchema = new Schema(
  {
    date: { type: Date, required: true, index: true },
    start_time: { type: String, required: true }, // "HH:mm"
    end_time: { type: String, required: true }, // "HH:mm"
    min_required: { type: Number, required: true, default: 1 },
    status: {
      type: String,
      enum: ["scheduled", "confirmed_enough", "confirmed_shortage", "cancelled"],
      default: "scheduled",
    },
    poll_message_id: { type: Number },
    poll_id: { type: String, index: true }, // id của poll Telegram, dùng để map poll_answer về đúng buổi tập
    need_recruit: { type: Boolean, default: false },
    recruit_count_needed: { type: Number, default: 0 },
    // Đánh dấu các mốc cron đã chạy để tránh trigger trùng — xem mục 6 thiết kế
    poll_sent_at: { type: Date },
    confirmation_sent_at: { type: Date },
    cost_reminder_sent_at: { type: Date },
  },
  { timestamps: true }
);

export type SessionDoc = InferSchemaType<typeof SessionSchema>;

export default models.Session || model("Session", SessionSchema);
