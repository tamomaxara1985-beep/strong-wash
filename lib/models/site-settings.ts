import { type InferSchemaType, type Model, Schema, model, models } from "mongoose";
import { Types } from "mongoose";

/**
 * A fixed `_id` is what makes this a singleton.
 *
 * Two admins saving at once both upsert the same document rather than racing to
 * create a second one, and every read is a primary-key lookup with no sort or
 * "first document" convention to get wrong.
 *
 * Contact details (`phone`, `email`, `address`, `workHours`) used to live here.
 * They moved to `lib/locations/defaults.ts` and the `StoreLocation` model when
 * the site gained several branches — a single phone and address could not
 * describe more than one.
 */
export const SETTINGS_ID = new Types.ObjectId("000000000000000000000001");

const siteSettingsSchema = new Schema(
  {
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
