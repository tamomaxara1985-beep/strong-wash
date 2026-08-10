import { type InferSchemaType, type Model, Schema, model, models } from "mongoose";

import { localizedStringSchema } from "./shared";

/**
 * A promotional banner on the homepage.
 *
 * `alt` is `localizedStringSchema`, whose `ka` is required, because the artwork
 * carries its message inside the picture: without alt text a screen reader and a
 * search engine get nothing at all from a slide.
 *
 * `width` and `height` are copied from the chosen media asset rather than
 * measured at render time — `next/image` needs the intrinsic ratio to reserve
 * space, and without it the largest element above the fold reflows as it loads.
 */
const heroSlideSchema = new Schema(
  {
    image: { type: String, required: true, trim: true },
    alt: { type: localizedStringSchema, required: true },
    /** Site-relative path, e.g. "/c/sand-washing". Optional: a slide may be inert. */
    href: { type: String, trim: true },
    width: { type: Number },
    height: { type: Number },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

heroSlideSchema.index({ isActive: 1, order: 1 });

export type HeroSlideDocument = InferSchemaType<typeof heroSlideSchema>;

/**
 * `models.HeroSlide ??` is not optional: dev hot reload re-runs this module
 * against a connection that already has the model compiled, and a second
 * `model()` call throws OverwriteModelError.
 */
export const HeroSlide: Model<HeroSlideDocument> =
  (models.HeroSlide as Model<HeroSlideDocument>) ??
  model<HeroSlideDocument>("HeroSlide", heroSlideSchema);
