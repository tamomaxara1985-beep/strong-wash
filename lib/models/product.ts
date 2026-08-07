import { type InferSchemaType, type Model, Schema, model, models } from "mongoose";

import { localizedStringSchema, optionalLocalizedStringSchema } from "./shared";

/**
 * One array, three typed value fields. A single polymorphic `value` would force
 * a cast per document before `$gte`/`$lte` could run, and would make the index
 * on the numeric field useless.
 */
const productSpecSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    valueNumber: { type: Number },
    valueString: { type: String, trim: true },
    valueBool: { type: Boolean },
  },
  { _id: false },
);

const productImageSchema = new Schema(
  {
    url: { type: String, required: true, trim: true },
    alt: { type: localizedStringSchema, required: true },
    order: { type: Number, default: 0 },
  },
  { _id: false },
);

const productSchema = new Schema(
  {
    sku: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: localizedStringSchema, required: true },
    shortDescription: { type: localizedStringSchema, required: true },
    description: { type: localizedStringSchema, required: true },
    brand: { type: Schema.Types.ObjectId, ref: "Brand", required: true },
    /** Leaf category. */
    category: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    /** Denormalised from the category: its ancestors plus itself. */
    categoryAncestors: {
      type: [{ type: Schema.Types.ObjectId, ref: "Category" }],
      default: [],
    },
    /** Decimal GEL. Capital equipment prices are quoted in whole lari. */
    price: { type: Number, required: true, min: 0 },
    salePrice: { type: Number, default: null, min: 0 },
    /**
     * `salePrice ?? price`, maintained by the pre-save hook below.
     *
     * Filtering and sorting have to use the price a buyer actually pays. Doing
     * that with `$ifNull` inside the pipeline means an `$addFields` before the
     * `$match`, which no index can serve. Storing the derived value keeps the
     * compound index usable on the hot path.
     */
    effectivePrice: { type: Number, required: true, min: 0 },
    stock: { type: Number, default: 0, min: 0 },
    stockStatus: {
      type: String,
      enum: ["in_stock", "low", "out", "preorder"],
      default: "out",
    },
    images: { type: [productImageSchema], default: [] },
    specs: { type: [productSpecSchema], default: [] },
    /** Denormalised name + brand + key specs, for lexical search. */
    searchText: { type: optionalLocalizedStringSchema },
    /** Phase 3: voyage-3.5, 1024 dimensions. */
    embedding: { type: [Number], default: undefined, select: false },
    embeddingUpdatedAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
  },
  { timestamps: true },
);

/**
 * Keeps the derived price in step with whatever writes `price`/`salePrice`.
 *
 * `pre("validate")`, not `pre("save")`: Mongoose registers validation as a save
 * hook when the schema is built, so it runs *before* any hook added afterwards.
 * A required derived field assigned in `pre("save")` therefore fails validation
 * on insert — it has not been computed yet.
 */
productSchema.pre("validate", function syncEffectivePrice() {
  this.effectivePrice = this.salePrice ?? this.price;
});

// Compound order matters: equality fields first, then the range/sort field.
productSchema.index({ categoryAncestors: 1, isActive: 1, effectivePrice: 1 });
productSchema.index({ categoryAncestors: 1, brand: 1, isActive: 1 });
productSchema.index({ "specs.key": 1, "specs.valueNumber": 1 });
productSchema.index({ "specs.key": 1, "specs.valueString": 1 });
productSchema.index({ isFeatured: 1, isActive: 1 });
productSchema.index({ isActive: 1, salePrice: 1 });

export type ProductDocument = InferSchemaType<typeof productSchema>;

export const Product: Model<ProductDocument> =
  (models.Product as Model<ProductDocument>) ?? model<ProductDocument>("Product", productSchema);
