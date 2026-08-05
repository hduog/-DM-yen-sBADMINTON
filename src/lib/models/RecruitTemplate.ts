import { Schema, model, models, type InferSchemaType } from "mongoose";

const RecruitTemplateSchema = new Schema(
  {
    name: { type: String, required: true },
    // placeholder hỗ trợ: {date} {time} {quantity} {location}
    content_template: { type: String, required: true },
  },
  { timestamps: true }
);

export type RecruitTemplateDoc = InferSchemaType<typeof RecruitTemplateSchema>;

export default models.RecruitTemplate || model("RecruitTemplate", RecruitTemplateSchema);
