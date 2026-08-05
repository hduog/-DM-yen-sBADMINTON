import { Schema, model, models, type InferSchemaType } from "mongoose";

// Ghi lại chính xác phần tiền mỗi thành viên chịu cho 1 buổi tập tại thời điểm quyết toán
// (settleSessionCost trong session-actions.ts) — dùng để xem sao kê theo từng buổi/ngày, độc lập
// với MonthlyStatement (vốn chỉ lưu tổng gộp theo tháng).
const SessionMemberCostSchema = new Schema(
  {
    session_id: { type: Schema.Types.ObjectId, ref: "Session", required: true, index: true },
    member_id: { type: Schema.Types.ObjectId, ref: "Member", required: true, index: true },
    amount: { type: Number, required: true },
    units: { type: Number, required: true }, // số suất — 1 nếu chỉ điểm danh, cộng thêm nếu gánh khách vãng lai
  },
  { timestamps: true }
);

SessionMemberCostSchema.index({ session_id: 1, member_id: 1 }, { unique: true });

export type SessionMemberCostDoc = InferSchemaType<typeof SessionMemberCostSchema>;

export default models.SessionMemberCost || model("SessionMemberCost", SessionMemberCostSchema);
