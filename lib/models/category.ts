import {
  type HydratedDocument,
  type InferSchemaType,
  type Model,
  Schema,
  Types,
  model,
  models,
} from "mongoose";

import { localizedStringSchema, specDefinitionSchema } from "./shared";

const categorySchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: localizedStringSchema, required: true },
    description: { type: localizedStringSchema },
    parent: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    /**
     * Materialised path, root -> parent. This is what turns "every product
     * anywhere under Automatic wash systems" into one indexed query instead of a
     * recursive tree walk.
     */
    ancestors: { type: [{ type: Schema.Types.ObjectId, ref: "Category" }], default: [] },
    path: { type: String, required: true, trim: true },
    image: { type: String, trim: true },
    icon: { type: String, trim: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    specSchema: { type: [specDefinitionSchema], default: [] },
  },
  { timestamps: true },
);

categorySchema.index({ ancestors: 1 });
categorySchema.index({ parent: 1, order: 1 });
categorySchema.index({ isActive: 1, order: 1 });

export type CategoryDocument = InferSchemaType<typeof categorySchema>;

/**
 * `ancestors` and `path` are derived, never hand-written. Recomputing them from
 * `parent` on save keeps the two in step with the tree.
 *
 * Scope note: this fixes up the document being saved, not its descendants. Once
 * the admin panel (Phase 4) can re-parent a category, moving a node has to
 * re-save the whole subtree — a one-line `find({ancestors: id})` loop, but it
 * has to exist.
 *
 * On `validate` rather than `save`, because `path` is required: validation is
 * itself a save hook registered when the schema is built, so it runs before any
 * hook added later and would reject a document whose path this has yet to
 * compute.
 */
categorySchema.pre(
  "validate",
  async function fillAncestors(this: HydratedDocument<CategoryDocument>) {
    if (!this.isNew && !this.isModified("parent") && !this.isModified("slug")) return;

    if (!this.parent) {
      this.ancestors = [];
      this.path = `/${this.slug}`;
      return;
    }

    const parent = await (this.constructor as Model<CategoryDocument>)
      .findById(this.parent)
      .select("ancestors path")
      .lean();

    if (!parent) {
      throw new Error(
        `Category "${this.slug}" references a missing parent ${String(this.parent)}`,
      );
    }

    this.ancestors = [...parent.ancestors, this.parent] as Types.ObjectId[];
    this.path = `${parent.path}/${this.slug}`;
  },
);

export const Category: Model<CategoryDocument> =
  (models.Category as Model<CategoryDocument>) ??
  model<CategoryDocument>("Category", categorySchema);
