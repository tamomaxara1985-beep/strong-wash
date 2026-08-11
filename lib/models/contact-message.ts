import { type InferSchemaType, type Model, Schema, model, models } from "mongoose";

import { LOCALES } from "../types";

export const CONTACT_STATUSES = ["new", "handled"] as const;

/**
 * A message from the contact page.
 *
 * Its own collection rather than a `QuoteRequest` with no product: that model
 * requires `product`, and relaxing it would leave every quote query and the
 * attachment list asking whether a row is really a quote, to save one collection.
 *
 * Two statuses, not the quote request's three: a message has either been dealt
 * with or it has not, and a middle state the operator must interpret earns
 * nothing. `locale` is stored so a reply goes out in the language the sender
 * wrote in.
 */
const contactMessageSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true, maxlength: 4000 },
    locale: { type: String, enum: LOCALES, required: true },
    status: { type: String, enum: CONTACT_STATUSES, default: "new" },
  },
  { timestamps: true },
);

/** The admin list's only query: unread first is a sort in the page, not here. */
contactMessageSchema.index({ status: 1, createdAt: -1 });

export type ContactMessageDocument = InferSchemaType<typeof contactMessageSchema>;

/**
 * `models.ContactMessage ??` is not optional: dev hot reload re-runs this module
 * against a connection that already has the model compiled, and a second
 * `model()` call throws OverwriteModelError.
 *
 * Same dev caveat as the other models: because the compiled model is cached,
 * **editing this schema needs a dev-server restart**. Hot reload keeps the old
 * schema and Mongoose then strips any newly added field on write, with no error.
 */
export const ContactMessage: Model<ContactMessageDocument> =
  (models.ContactMessage as Model<ContactMessageDocument>) ??
  model<ContactMessageDocument>("ContactMessage", contactMessageSchema);
