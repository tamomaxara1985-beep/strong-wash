import { Types } from "mongoose";

import { Category, type CategoryDocument } from "../models/category";
import { Product } from "../models/product";

/**
 * The write side of the category tree.
 *
 * `ancestors` and `path` are materialised on every category, and
 * `categoryAncestors` is denormalised onto every product. That is what makes
 * "everything under Automatic wash systems" one indexed query — and it is why
 * moving a category is not a one-document edit. Change a parent without
 * rewriting the subtree and its products keep pointing at the old lineage: they
 * disappear from their new parent's listing and linger in the old one, with
 * nothing failing loudly.
 *
 * The model's pre-validate hook fixes the document being saved. Everything below
 * it is this module's job.
 */

export type CategoryFailure = { field: string; code: string };

/**
 * Every descendant of a category, deepest last.
 *
 * Read from `ancestors` rather than walked recursively: one indexed query returns
 * the whole subtree, and sorting by depth means a parent is always reindexed
 * before its children read from it.
 */
async function descendantsOf(id: Types.ObjectId) {
  const docs = await Category.find({ ancestors: id }).lean();
  return docs.sort((a, b) => (a.ancestors?.length ?? 0) - (b.ancestors?.length ?? 0));
}

/**
 * Refuses a move that would detach part of the tree from its root.
 *
 * Setting a category's parent to itself, or to one of its own descendants, makes
 * a cycle: the subtree becomes unreachable from any root, so it vanishes from the
 * menu while still holding products.
 */
export async function wouldCreateCycle(
  categoryId: Types.ObjectId,
  parentId: Types.ObjectId | null,
): Promise<boolean> {
  if (!parentId) return false;
  if (parentId.equals(categoryId)) return true;

  const parent = await Category.findById(parentId).select("ancestors").lean();
  if (!parent) return false;
  return (parent.ancestors ?? []).some((ancestor) => ancestor.equals(categoryId));
}

/**
 * Rewrites `ancestors` and `path` for a category's whole subtree, then repairs the
 * denormalised `categoryAncestors` on every product underneath.
 *
 * Called after any change to a category's parent or slug — both of which change
 * the lineage its descendants inherit.
 */
export async function reindexSubtree(rootId: Types.ObjectId): Promise<{
  categories: number;
  products: number;
}> {
  const root = await Category.findById(rootId);
  if (!root) return { categories: 0, products: 0 };

  const affected = [root._id, ...(await descendantsOf(root._id)).map((d) => d._id)];

  // Parents first, so each child recomputes from an already-correct parent.
  for (const id of affected.slice(1)) {
    const doc = await Category.findById(id);
    if (!doc) continue;
    // The pre-validate hook derives ancestors and path from `parent`; marking it
    // modified is what makes the hook run on an otherwise unchanged document.
    doc.markModified("parent");
    await doc.save();
  }

  /**
   * Products carry their category's ancestors plus the category itself. Rebuilt
   * per affected category rather than for the whole collection, so the cost is
   * proportional to the subtree that actually moved.
   */
  let products = 0;
  for (const id of affected) {
    const doc = await Category.findById(id).select("ancestors").lean();
    if (!doc) continue;
    const lineage = [...(doc.ancestors ?? []), id];
    const result = await Product.updateMany(
      { category: id },
      { $set: { categoryAncestors: lineage } },
    );
    products += result.modifiedCount;
  }

  return { categories: affected.length, products };
}

/** Categories that cannot be a parent of this one: itself and its descendants. */
export async function invalidParents(categoryId: string): Promise<string[]> {
  if (!Types.ObjectId.isValid(categoryId)) return [];
  const id = new Types.ObjectId(categoryId);
  const subtree = await descendantsOf(id);
  return [categoryId, ...subtree.map((d) => String(d._id))];
}

export type DeleteBlock =
  | { ok: true }
  | { ok: false; reason: "has_children"; children: number }
  | { ok: false; reason: "has_products"; products: number };

/**
 * Deletion is refused while anything depends on the category.
 *
 * Cascading would take products or whole branches with it, and an operator
 * clearing out a menu entry does not expect to lose the machines filed under it.
 * Products must be moved first, or the category deactivated instead — which hides
 * it from the storefront and keeps everything intact.
 */
export async function canDelete(id: Types.ObjectId): Promise<DeleteBlock> {
  const children = await Category.countDocuments({ parent: id });
  if (children > 0) return { ok: false, reason: "has_children", children };

  // Counts products filed directly here, not the whole subtree — children are
  // already refused above.
  const products = await Product.countDocuments({ category: id });
  if (products > 0) return { ok: false, reason: "has_products", products };

  return { ok: true };
}

export type CategoryDoc = CategoryDocument;
