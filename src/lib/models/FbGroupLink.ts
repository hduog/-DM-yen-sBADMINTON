import { Schema, model, models, type InferSchemaType } from "mongoose";

const FbGroupLinkSchema = new Schema(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
  },
  { timestamps: true }
);

export type FbGroupLinkDoc = InferSchemaType<typeof FbGroupLinkSchema>;

export default models.FbGroupLink || model("FbGroupLink", FbGroupLinkSchema);
