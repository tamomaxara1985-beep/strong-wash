import { type InferSchemaType, type Model, Schema, model, models } from "mongoose";

import { LOCALES } from "../types";

export const QUOTE_STATUSES = ["new", "contacted", "closed"] as const;

/**
 * The v1 conversion event. Capital equipment is quoted, not carted, so a quote
 * request is the terminal action on a product page.
 *
 * `user` is nullable on purpose: a signed-out visitor can still request a quote,
 * and requiring an account before a sales enquiry would cost leads. Contact
 * details are copied onto the request rather than read through the user
 * reference, so editing a profile later cannot rewrite the history of what was
 * actually submitted.
 */
/**
 * A file the enquirer attached — a photo of the bay, a site drawing.
 *
 * `publicId` is kept alongside the URL because deleting from Cloudinary needs
 * the id, not the delivery URL. `originalName` is the sanitised client filename,
 * stored for display only; it is never a storage key.
 */
const attachmentSchema = new Schema(
  {
    url: { type: String, required: true, trim: true },
    publicId: { type: String, required: true, trim: true },
    /** "image" | "raw" | "video" — needed to delete the file; see lib/cloudinary.ts. */
    resourceType: { type: String, required: true, trim: true, default: "image" },
    bytes: { type: Number, required: true, min: 0 },
    format: { type: String, required: true, trim: true },
    width: { type: Number },
    height: { type: Number },
    originalName: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const quoteRequestSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", default: null },
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    company: { type: String, trim: true },
    message: { type: String, trim: true, maxlength: 4000 },
    attachments: { type: [attachmentSchema], default: [] },
    locale: { type: String, enum: LOCALES, required: true },
    status: { type: String, enum: QUOTE_STATUSES, default: "new" },
  },
  { timestamps: true },
);

quoteRequestSchema.index({ user: 1, createdAt: -1 });
quoteRequestSchema.index({ status: 1, createdAt: -1 });

export type QuoteRequestDocument = InferSchemaType<typeof quoteRequestSchema>;

/**
 * Reused from the model registry when already compiled, which is what keeps hot
 * reload from throwing OverwriteModelError.
 *
 * Dev caveat worth knowing: because the compiled model is cached, **editing this
 * schema needs a dev-server restart**. Hot reload re-runs the module but keeps
 * the old compiled schema, and Mongoose then strips any newly added field on
 * write — the value simply never lands, with no error.
 */
export const QuoteRequest: Model<QuoteRequestDocument> =
  (models.QuoteRequest as Model<QuoteRequestDocument>) ??
  model<QuoteRequestDocument>("QuoteRequest", quoteRequestSchema);
