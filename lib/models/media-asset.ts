import { type InferSchemaType, type Model, Schema, model, models } from "mongoose";

/**
 * A file in the admin media library.
 *
 * Separate from `QuoteRequest.attachments` on purpose: an attachment is evidence
 * belonging to one enquiry and is meaningless detached from it, whereas a library
 * asset is reusable content the operator manages. Phase 4's product images will
 * draw on this collection rather than uploading again.
 *
 * `resourceType` is stored because Cloudinary's delete and rename APIs require
 * the concrete type — they reject the "auto" that uploads accept.
 */
const mediaAssetSchema = new Schema(
  {
    publicId: { type: String, required: true, unique: true, trim: true },
    url: { type: String, required: true, trim: true },
    resourceType: { type: String, required: true, trim: true, default: "image" },
    bytes: { type: Number, required: true, min: 0 },
    format: { type: String, required: true, trim: true },
    width: { type: Number },
    height: { type: Number },
    /** Editable label. Falls back to the sanitised upload filename. */
    title: { type: String, required: true, trim: true, maxlength: 120 },
    originalName: { type: String, required: true, trim: true },
    /** Who uploaded it. Kept as a reference so a deleted admin does not orphan the row. */
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

mediaAssetSchema.index({ createdAt: -1 });
mediaAssetSchema.index({ title: 1 });

export type MediaAssetDocument = InferSchemaType<typeof mediaAssetSchema>;

/**
 * Reused from the registry when already compiled, so hot reload does not throw
 * OverwriteModelError. Editing this schema needs a dev-server restart: the
 * cached compiled schema survives reload and silently strips new fields.
 */
export const MediaAsset: Model<MediaAssetDocument> =
  (models.MediaAsset as Model<MediaAssetDocument>) ??
  model<MediaAssetDocument>("MediaAsset", mediaAssetSchema);
