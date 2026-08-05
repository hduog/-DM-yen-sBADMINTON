import { Schema, model, models, type InferSchemaType } from "mongoose";

const ItemConfigSchema = new Schema(
  {
    name: { type: String, required: true }, // VD: "trái cầu", "chai nước"
    unit_price: { type: Number, required: true },
    unit: { type: String, required: true }, // VD: "quả", "chai"
  },
  { timestamps: true }
);

export type ItemConfigDoc = InferSchemaType<typeof ItemConfigSchema>;

export default models.ItemConfig || model("ItemConfig", ItemConfigSchema);
