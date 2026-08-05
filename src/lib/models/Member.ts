import { Schema, model, models, type InferSchemaType } from "mongoose";

const MemberSchema = new Schema(
  {
    telegram_id: { type: Number, required: true, unique: true, index: true },
    full_name: { type: String, required: true },
    username: { type: String },
    role: { type: String, enum: ["admin", "member"], default: "member" },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    // Soft delete: thành viên bị admin hủy vẫn giữ lịch sử điểm danh/sao kê nhưng ẩn khỏi danh sách & mất quyền truy cập.
    del_flag: { type: Boolean, default: false },
    // chat_id của group riêng (admin + member này) dùng để gửi sao kê — xem mục 1.3 thiết kế
    statement_chat_id: { type: Number },
    joined_at: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

export type Member = InferSchemaType<typeof MemberSchema>;

export default models.Member || model("Member", MemberSchema);
