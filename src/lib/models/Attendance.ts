import { Schema, model, models, type InferSchemaType } from "mongoose";

const AttendanceSchema = new Schema(
  {
    session_id: { type: Schema.Types.ObjectId, ref: "Session", required: true, index: true },
    member_id: { type: Schema.Types.ObjectId, ref: "Member", required: true, index: true },
    answer: { type: String, enum: ["present", "absent", "no_response"], default: "no_response" },
    answered_at: { type: Date },
  },
  { timestamps: true }
);

AttendanceSchema.index({ session_id: 1, member_id: 1 }, { unique: true });

export type AttendanceDoc = InferSchemaType<typeof AttendanceSchema>;

export default models.Attendance || model("Attendance", AttendanceSchema);
