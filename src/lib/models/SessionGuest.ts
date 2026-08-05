import { Schema, model, models, type InferSchemaType } from "mongoose";

const SessionGuestSchema = new Schema(
  {
    session_id: { type: Schema.Types.ObjectId, ref: "Session", required: true, index: true },
    guest_name: { type: String },
    quantity: { type: Number, required: true, default: 1, min: 1 },
    // Thành viên chịu trách nhiệm chi phí của khách — được cộng thêm suất dù có điểm danh hay
    // không, xem getSessionCostUnits trong session-actions.ts.
    responsible_member_id: { type: Schema.Types.ObjectId, ref: "Member", required: true },
  },
  { timestamps: true }
);

export type SessionGuestDoc = InferSchemaType<typeof SessionGuestSchema>;

export default models.SessionGuest || model("SessionGuest", SessionGuestSchema);
