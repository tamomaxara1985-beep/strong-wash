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
const quoteRequestSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", default: null },
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    company: { type: String, trim: true },
    message: { type: String, trim: true, maxlength: 4000 },
    locale: { type: String, enum: LOCALES, required: true },
    status: { type: String, enum: QUOTE_STATUSES, default: "new" },
  },
  { timestamps: true },
);

quoteRequestSchema.index({ user: 1, createdAt: -1 });
quoteRequestSchema.index({ status: 1, createdAt: -1 });

export type QuoteRequestDocument = InferSchemaType<typeof quoteRequestSchema>;

export const QuoteRequest: Model<QuoteRequestDocument> =
  (models.QuoteRequest as Model<QuoteRequestDocument>) ??
  model<QuoteRequestDocument>("QuoteRequest", quoteRequestSchema);
