import { cache } from "react";

import { connectToDatabase } from "../db";
import { Category as CategoryModel } from "../models/category";
import type { SpecSchemaLookup } from "../specs";
import type { Category, CategoryNode, SpecDefinition } from "../types";
import { toCategory } from "./map";

/**
 * The whole tree is a few dozen small documents and every page needs some of it
 * (header, footer, breadcrumbs, facets), so it is read once per request and
 * traversed in memory. `cache()` dedupes across the component tree: the header,
 * the footer and the page body each ask for the tree and share one round trip.
 *
 * Phase 5 can layer `revalidate`-based caching on top; per-request dedupe is the
 * part that matters for correctness of the render.
 */
export const getAllCategories = cache(async (): Promise<Category[]> => {
  await connectToDatabase();
  const docs = await CategoryModel.find({ isActive: true })
    .sort({ order: 1 })
    .lean();
  return docs.map(toCategory);
});

async function index() {
  const all = await getAllCategories();
  return {
    all,
    byId: new Map(all.map((c) => [c.id, c])),
    bySlug: new Map(all.map((c) => [c.slug, c])),
  };
}

export async function getCategoryById(id: string): Promise<Category | undefined> {
  return (await index()).byId.get(id);
}

export async function getCategoryBySlug(slug: string): Promise<Category | undefined> {
  return (await index()).bySlug.get(slug);
}

export async function getRootCategories(): Promise<Category[]> {
  const { all } = await index();
  return all.filter((c) => c.parent === null).sort((a, b) => a.order - b.order);
}

export async function getChildren(categoryId: string): Promise<Category[]> {
  const { all } = await index();
  return all.filter((c) => c.parent === categoryId).sort((a, b) => a.order - b.order);
}

/** Root -> category, for breadcrumbs. */
export async function getCategoryTrail(category: Category): Promise<Category[]> {
  const { byId } = await index();
  const trail = category.ancestors
    .map((id) => byId.get(id))
    .filter((c): c is Category => Boolean(c));
  return [...trail, category];
}

/**
 * The category and everything under it. Products carry `categoryAncestors`, so
 * one `$in` against this list scopes a subtree query without a tree walk.
 */
export async function getSubtreeIds(categoryId: string): Promise<string[]> {
  const { all } = await index();
  return [categoryId, ...all.filter((c) => c.ancestors.includes(categoryId)).map((c) => c.id)];
}

/**
 * A category's own spec definitions merged with every ancestor's, nearest
 * ancestor winning on key collision. This is what lets shared attributes live
 * once at the root and still render on every leaf.
 */
export async function getEffectiveSpecSchema(category: Category): Promise<SpecDefinition[]> {
  const { byId } = await index();
  const chain = [...category.ancestors.map((id) => byId.get(id)), category].filter(
    (c): c is Category => Boolean(c),
  );

  const merged = new Map<string, SpecDefinition>();
  for (const node of chain) {
    for (const def of node.specSchema) merged.set(def.key, def);
  }
  return [...merged.values()].sort((a, b) => a.order - b.order);
}

/**
 * One prepared, memoised resolver for every category's effective schema.
 *
 * Product cards render synchronously, so they cannot await a schema each. The
 * caller awaits this once and hands the closure down; each distinct category is
 * merged at most once per request.
 */
export async function getSpecSchemaLookup(): Promise<SpecSchemaLookup> {
  const { byId } = await index();
  const memo = new Map<string, SpecDefinition[]>();

  return (categoryId: string): SpecDefinition[] => {
    const cached = memo.get(categoryId);
    if (cached) return cached;

    const category = byId.get(categoryId);
    if (!category) return [];

    const chain = [...category.ancestors.map((id) => byId.get(id)), category].filter(
      (c): c is Category => Boolean(c),
    );
    const merged = new Map<string, SpecDefinition>();
    for (const node of chain) {
      for (const def of node.specSchema) merged.set(def.key, def);
    }
    const schema = [...merged.values()].sort((a, b) => a.order - b.order);
    memo.set(categoryId, schema);
    return schema;
  };
}

export async function getCategoryTree(): Promise<CategoryNode[]> {
  const { all } = await index();
  const nodes = new Map<string, CategoryNode>(all.map((c) => [c.id, { ...c, children: [] }]));

  const roots: CategoryNode[] = [];
  for (const node of nodes.values()) {
    if (node.parent && nodes.has(node.parent)) {
      nodes.get(node.parent)!.children.push(node);
    } else if (!node.parent) {
      roots.push(node);
    }
  }

  const byOrder = (a: CategoryNode, b: CategoryNode) => a.order - b.order;
  for (const node of nodes.values()) node.children.sort(byOrder);
  return roots.sort(byOrder);
}
