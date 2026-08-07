import { type InferSchemaType, type Model, Schema, model, models } from "mongoose";

import { localizedStringSchema } from "./shared";

const brandSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    // Manufacturer names are proper nouns — the same string in all three locales.
    name: { type: String, required: true, trim: true },
    logo: { type: String, trim: true },
    description: { type: localizedStringSchema },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

brandSchema.index({ isActive: 1, order: 1 });

export type BrandDocument = InferSchemaType<typeof brandSchema>;

/**
 * `models.Brand ??` is not optional: dev hot reload re-runs this module against
 * a connection that already has the model compiled, and a second `model()` call
 * throws OverwriteModelError.
 */
export const Brand: Model<BrandDocument> =
  (models.Brand as Model<BrandDocument>) ?? model<BrandDocument>("Brand", brandSchema);
