import { Schema, model, models, type InferSchemaType } from "mongoose";

const SessionCostSchema = new Schema(
  {
    session_id: { type: Schema.Types.ObjectId, ref: "Session", required: true, index: true },
    item_id: { type: Schema.Types.ObjectId, ref: "ItemConfig", required: true },
    quantity: { type: Number, required: true },
    total_amount: { type: Number, required: true },
  },
  { timestamps: true }
);

export type SessionCostDoc = InferSchemaType<typeof SessionCostSchema>;

export default models.SessionCost || model("SessionCost", SessionCostSchema);
