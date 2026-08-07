import { Schema } from "mongoose";

/**
 * Georgian is required, EN/RU optional — `pickLocale()` falls back to `ka` at
 * read time. `_id: false` keeps Mongoose from stamping an ObjectId onto every
 * localized subdocument, which would triple the size of a product for nothing.
 */
export const localizedStringSchema = new Schema(
  {
    ka: { type: String, required: true, trim: true },
    en: { type: String, trim: true },
    ru: { type: String, trim: true },
  },
  { _id: false },
);

/** Same shape, but for fields where even Georgian is optional. */
export const optionalLocalizedStringSchema = new Schema(
  {
    ka: { type: String, trim: true },
    en: { type: String, trim: true },
    ru: { type: String, trim: true },
  },
  { _id: false },
);

export const specOptionSchema = new Schema(
  {
    value: { type: String, required: true, trim: true },
    label: { type: localizedStringSchema, required: true },
  },
  { _id: false },
);

/**
 * The facet contract. A category's effective schema is its own definitions
 * merged with every ancestor's, so shared attributes live once at the root.
 */
export const specDefinitionSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: localizedStringSchema, required: true },
    type: { type: String, enum: ["number", "enum", "bool"], required: true },
    unit: { type: String, trim: true },
    options: { type: [specOptionSchema], default: undefined },
    filterable: { type: Boolean, default: true },
    showInCard: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { _id: false },
);
