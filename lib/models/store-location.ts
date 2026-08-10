import { type InferSchemaType, type Model, Schema, model, models } from "mongoose";

import { localizedStringSchema } from "./shared";

/**
 * One branch: somewhere a customer can walk into, with its own number.
 *
 * `phone` is a single string for the same reason a brand name is — a telephone
 * number is not translated. `name`, `address` and `workHours` are localized
 * because each genuinely reads differently per language.
 *
 * The model is called StoreLocation rather than Location because `Location` is a
 * global DOM type in TypeScript, and a same-named export shadows it in every file
 * that touches both.
 */
const storeLocationSchema = new Schema(
  {
    name: { type: localizedStringSchema, required: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: localizedStringSchema, required: true },
    workHours: { type: localizedStringSchema, required: true },
    /** Google Maps only; the one link on this site that deliberately leaves it. */
    mapUrl: { type: String, trim: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

storeLocationSchema.index({ isActive: 1, order: 1 });

export type StoreLocationDocument = InferSchemaType<typeof storeLocationSchema>;

/**
 * `models.StoreLocation ??` is not optional: dev hot reload re-runs this module
 * against a connection that already has the model compiled, and a second
 * `model()` call throws OverwriteModelError.
 */
export const StoreLocation: Model<StoreLocationDocument> =
  (models.StoreLocation as Model<StoreLocationDocument>) ??
  model<StoreLocationDocument>("StoreLocation", storeLocationSchema);
