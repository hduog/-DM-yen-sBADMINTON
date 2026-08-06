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
    notify_message_id: { type: Number }, // message_id của tin nhắn thông báo điểm danh đã gửi vào nhóm
    need_recruit: { type: Boolean, default: false },
    recruit_count_needed: { type: Number, default: 0 },
    notes: { type: String },
    // Đánh dấu các mốc cron đã chạy để tránh trigger trùng — xem mục 6 thiết kế
    notify_sent_at: { type: Date },
    confirmation_sent_at: { type: Date },
    // Lần gần nhất gửi "buổi tập đang diễn ra" vào nhóm chính, ngay khi tới giờ bắt đầu.
    start_notice_sent_at: { type: Date },
    // Lần gần nhất gửi nhắc quyết toán (kèm link) vào nhóm quản trị, sau giờ kết thúc N phút.
    cost_reminder_sent_at: { type: Date },
    // Đã phân bổ chi phí buổi này vào MonthlyStatement chưa — chặn quyết toán/huỷ trùng lặp cộng
    // dồn 2 lần, xem settleSessionCost() trong session-actions.ts.
    cost_settled_at: { type: Date },
    // Lần gần nhất bấm "Pass sân" — thuần đánh dấu để hiển thị UI, không khoá gì.
    pass_court_at: { type: Date },
  },
  { timestamps: true }
);

export type SessionDoc = InferSchemaType<typeof SessionSchema>;

export default models.Session || model("Session", SessionSchema);
