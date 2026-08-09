import { type InferSchemaType, type Model, Schema, model, models } from "mongoose";
import { Types } from "mongoose";

import { optionalLocalizedStringSchema } from "./shared";

/**
 * A fixed `_id` is what makes this a singleton.
 *
 * Two admins saving at once both upsert the same document rather than racing to
 * create a second one, and every read is a primary-key lookup with no sort or
 * "first document" convention to get wrong.
 */
export const SETTINGS_ID = new Types.ObjectId("000000000000000000000001");

const siteSettingsSchema = new Schema(
  {
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    // Even Georgian is optional here: an unset field means "use the default",
    // which is the translated string already in messages/*.json.
    address: { type: optionalLocalizedStringSchema },
    workHours: { type: optionalLocalizedStringSchema },
    brandYellow: { type: String, trim: true },
    brandBlack: { type: String, trim: true },
    fontKey: { type: String, trim: true },
  },
  { timestamps: true },
);

export type SiteSettingsDocument = InferSchemaType<typeof siteSettingsSchema>;

/**
 * `models.SiteSettings ??` is not optional: dev hot reload re-runs this module
 * against a connection that already has the model compiled, and a second
 * `model()` call throws OverwriteModelError.
 */
export const SiteSettings: Model<SiteSettingsDocument> =
  (models.SiteSettings as Model<SiteSettingsDocument>) ??
  model<SiteSettingsDocument>("SiteSettings", siteSettingsSchema);
