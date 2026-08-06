import { Schema, model, models, type InferSchemaType } from "mongoose";

const MonthlyStatementSchema = new Schema(
  {
    member_id: { type: Schema.Types.ObjectId, ref: "Member", required: true, index: true },
    month: { type: String, required: true }, // "YYYY-MM"
    total_sessions: { type: Number, required: true, default: 0 },
    total_amount: { type: Number, required: true, default: 0 },
    // Phần đã trừ từ khoản chi trước (MemberAdvance) của thành viên khi chốt sao kê tháng — chỉ để
    // hiển thị minh bạch, total_amount ở trên đã là số tiền thực còn phải đóng (đã trừ khoản này).
    advance_applied: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["pending", "paid_reported", "approved"],
      default: "pending",
    },
    paid_reported_at: { type: Date },
    approved_at: { type: Date },
    approved_by: { type: Schema.Types.ObjectId, ref: "Member" },
  },
  { timestamps: true }
);

MonthlyStatementSchema.index({ member_id: 1, month: 1 }, { unique: true });

export type MonthlyStatementDoc = InferSchemaType<typeof MonthlyStatementSchema>;

export default models.MonthlyStatement || model("MonthlyStatement", MonthlyStatementSchema);
