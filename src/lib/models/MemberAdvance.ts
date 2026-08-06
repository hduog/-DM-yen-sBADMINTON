import { Schema, model, models, type InferSchemaType } from "mongoose";

// Khoản chi trước (VD: cọc sân) mà 1 thành viên đã tự chi hộ trong 1 tháng — được trừ vào tổng
// tiền buổi tập của thành viên đó đúng lúc chốt sao kê tháng (xem runDueMonthlySettlement trong
// session-actions.ts). Mỗi khoản chỉ áp dụng đúng 1 lần: applied_amount = phần đã trừ vào chi phí,
// refund_amount = phần dư (nếu chi trước nhiều hơn chi phí thực tế) cần hoàn lại thành viên.
const MemberAdvanceSchema = new Schema(
  {
    member_id: { type: Schema.Types.ObjectId, ref: "Member", required: true, index: true },
    month: { type: String, required: true }, // "YYYY-MM" — tháng phát sinh khoản chi trước
    amount: { type: Number, required: true },
    note: { type: String },
    status: { type: String, enum: ["open", "settled"], default: "open" },
    applied_amount: { type: Number, default: 0 },
    refund_amount: { type: Number, default: 0 },
    settled_at: { type: Date },
  },
  { timestamps: true }
);

export type MemberAdvanceDoc = InferSchemaType<typeof MemberAdvanceSchema>;

export default models.MemberAdvance || model("MemberAdvance", MemberAdvanceSchema);
