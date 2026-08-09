import { Types, type PipelineStage } from "mongoose";
import { cache } from "react";

import { connectToDatabase } from "../db";
import { Product as ProductModel } from "../models/product";
import {
  DEFAULT_PAGE_SIZE,
  type Brand,
  type BrandFacet,
  type Facets,
  type Locale,
  type Product,
  type ProductListResult,
  type ProductQuery,
  type SpecDefinition,
  type SpecFacet,
} from "../types";
import { getAllBrands, getAllBrandsIncludingInactive } from "./brands";
import { getCategoryBySlug, getEffectiveSpecSchema, getSubtreeIds } from "./categories";
import { toProduct } from "./map";

export { DEFAULT_PAGE_SIZE };

/**
 * "In stock" means a unit is physically held. Built-to-order systems are neither
 * in stock nor unavailable — counting `preorder` as in-stock would advertise a
 * shelf unit for a machine with a ten-week lead time.
 */
const HELD_IN_STOCK = ["in_stock", "low"] as const;

type Filter = Record<string, unknown>;

function and(filters: Filter[]): Filter {
  const used = filters.filter((f) => Object.keys(f).length > 0);
  if (!used.length) return {};
  if (used.length === 1) return used[0];
  return { $and: used };
}

/** Mongo has no literal escape for `$regex`, so the needle is escaped by hand. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ids(values: string[]): Types.ObjectId[] {
  return values.filter((v) => Types.ObjectId.isValid(v)).map((v) => new Types.ObjectId(v));
}

/**
 * Builds the filter as separate named dimensions instead of one blob.
 *
 * Facet counts must exclude their own dimension: a brand facet computed under a
 * filter that already includes the brand selection reports 0 for every
 * unselected brand, so nothing else is clickable and the user is stuck. Keeping
 * the dimensions addressable is what makes "everything except this one" cheap.
 */
async function buildFilters(query: ProductQuery, brands: Brand[]) {
  const base: Filter[] = [{ isActive: true }];
  let unsatisfiable = false;

  if (query.categorySlug) {
    const category = await getCategoryBySlug(query.categorySlug);
    if (!category) {
      unsatisfiable = true;
    } else {
      const subtree = await getSubtreeIds(category.id);
      base.push({ categoryAncestors: { $in: ids(subtree) } });
    }
  }

  const needle = query.q?.trim();
  if (needle) {
    const rx = { $regex: escapeRegex(needle), $options: "i" };
    // Substring match across the denormalised search text and the identifiers a
    // buyer is most likely to paste. Phase 3 replaces this with an Atlas Search
    // index; a regex scan is fine at a few hundred documents and wrong at a few
    // hundred thousand.
    base.push({
      $or: [
        { sku: rx },
        { slug: rx },
        { "name.ka": rx },
        { "name.en": rx },
        { "name.ru": rx },
        { "searchText.ka": rx },
        { "searchText.en": rx },
        { "searchText.ru": rx },
      ],
    });
  }

  const dimensions: Record<string, Filter> = {};

  if (query.brands.length) {
    const wanted = query.brands
      .map((slug) => brands.find((b) => b.slug === slug)?.id)
      .filter((id): id is string => Boolean(id));
    // A filter naming only unknown brands must return nothing, not everything.
    dimensions.brand = { brand: { $in: ids(wanted) } };
  }

  if (query.priceMin !== undefined || query.priceMax !== undefined) {
    const range: Record<string, number> = {};
    if (query.priceMin !== undefined) range.$gte = query.priceMin;
    if (query.priceMax !== undefined) range.$lte = query.priceMax;
    dimensions.price = { effectivePrice: range };
  }

  if (query.inStockOnly) {
    dimensions.stock = { stockStatus: { $in: [...HELD_IN_STOCK] } };
  }

  for (const [key, constraint] of Object.entries(query.specs)) {
    const match: Filter = { key };
    if (constraint.values?.length) {
      match.valueString = { $in: constraint.values };
    } else if (constraint.bool !== undefined) {
      match.valueBool = constraint.bool;
    } else if (constraint.min !== undefined || constraint.max !== undefined) {
      const range: Record<string, number> = {};
      if (constraint.min !== undefined) range.$gte = constraint.min;
      if (constraint.max !== undefined) range.$lte = constraint.max;
      match.valueNumber = range;
    }
    /**
     * `$elemMatch` per key, ANDed — not a flat `{'specs.key': k, 'specs.valueNumber': v}`.
     * The flat form matches a product where one array element supplies the key
     * and a *different* element supplies the value, which is a false positive.
     */
    dimensions[`spec:${key}`] = { specs: { $elemMatch: match } };
  }

  return { base, dimensions, unsatisfiable };
}

function sortStage(sort: ProductQuery["sort"], locale: Locale): PipelineStage.Sort["$sort"] {
  switch (sort) {
    case "price_asc":
      return { effectivePrice: 1, _id: 1 };
    case "price_desc":
      return { effectivePrice: -1, _id: 1 };
    case "newest":
      return { createdAt: -1, _id: 1 };
    case "name_asc":
      // Binary order, not ICU collation. Mkhedruli and Cyrillic sort correctly
      // by code point; mixed-case Latin does not (all uppercase sorts first).
      // Revisit with a collation once the catalogue has enough Latin titles for
      // it to be visible.
      return { [`name.${locale}`]: 1, "name.ka": 1, _id: 1 };
    case "relevance":
    default:
      // Featured first, then anything actually available, then newest. Phase 3
      // replaces this with a fused lexical + vector score.
      return { isFeatured: -1, stock: -1, createdAt: -1, _id: 1 };
  }
}

/** `$facet` keys cannot contain dots, and spec keys are free-form. */
function specFacetKey(key: string): string {
  return `spec_${key.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

type FacetRequest =
  | { kind: "brands" }
  | { kind: "price" }
  | { kind: "inStock" }
  | { kind: "spec"; def: SpecDefinition };

function facetPipeline(request: FacetRequest): PipelineStage.FacetPipelineStage[] {
  switch (request.kind) {
    case "brands":
      return [{ $group: { _id: "$brand", count: { $sum: 1 } } }];
    case "price":
      return [
        {
          $group: {
            _id: null,
            min: { $min: "$effectivePrice" },
            max: { $max: "$effectivePrice" },
          },
        },
      ];
    case "inStock":
      return [{ $match: { stockStatus: { $in: [...HELD_IN_STOCK] } } }, { $count: "n" }];
    case "spec": {
      const { def } = request;
      const stages: PipelineStage.FacetPipelineStage[] = [
        // Narrow to documents carrying the key before unwinding, so the unwind
        // does not fan out the whole collection.
        { $match: { "specs.key": def.key } },
        { $unwind: "$specs" },
        { $match: { "specs.key": def.key } },
      ];
      if (def.type === "enum") {
        stages.push({ $group: { _id: "$specs.valueString", count: { $sum: 1 } } });
      } else if (def.type === "bool") {
        stages.push({
          $match: { "specs.valueBool": true },
        });
        stages.push({ $count: "n" });
      } else {
        stages.push({
          $group: {
            _id: null,
            min: { $min: "$specs.valueNumber" },
            max: { $max: "$specs.valueNumber" },
          },
        });
      }
      return stages;
    }
  }
}

type FacetResult = Record<string, unknown[]>;

function readBrandFacet(rows: unknown[], brands: Brand[]): BrandFacet[] {
  const counts = new Map<string, number>();
  for (const row of rows as { _id: Types.ObjectId | null; count: number }[]) {
    if (row._id) counts.set(row._id.toString(), row.count);
  }
  return brands
    .filter((b) => counts.has(b.id))
    .map((b) => ({ slug: b.slug, name: b.name, count: counts.get(b.id) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function readSpecFacet(def: SpecDefinition, rows: unknown[]): SpecFacet | null {
  if (!rows.length) return null;

  if (def.type === "enum") {
    const counts = new Map<string, number>();
    for (const row of rows as { _id: string | null; count: number }[]) {
      if (row._id != null) counts.set(row._id, row.count);
    }
    const buckets = (def.options ?? [])
      .filter((o) => counts.has(o.value))
      .map((o) => ({ value: o.value, label: o.label, count: counts.get(o.value) ?? 0 }));
    if (!buckets.length) return null;
    return { key: def.key, label: def.label, type: "enum", unit: def.unit, buckets };
  }

  if (def.type === "bool") {
    const trueCount = (rows[0] as { n?: number }).n ?? 0;
    if (!trueCount) return null;
    return { key: def.key, label: def.label, type: "bool", trueCount };
  }

  const { min, max } = rows[0] as { min?: number | null; max?: number | null };
  if (min == null || max == null || min === max) return null; // A single value is not a range control.
  return { key: def.key, label: def.label, type: "number", unit: def.unit, min, max };
}

function emptyResult(query: ProductQuery, pageSize: number): ProductListResult {
  return {
    products: [],
    total: 0,
    page: 1,
    pageSize,
    totalPages: 1,
    facets: { brands: [], price: { min: 0, max: 0 }, specs: [], inStockCount: 0 },
  };
}

/**
 * One faceted read: page of products, total, and every facet count.
 *
 * Facet requests are grouped by the filter they need. Every dimension the user
 * has *not* filtered on shares the full filter, so the common case — a bare
 * category page — collapses to a single round trip, and each active filter adds
 * one more.
 */
export async function queryProducts(
  query: ProductQuery,
  locale: Locale = "ka",
): Promise<ProductListResult> {
  await connectToDatabase();

  const pageSize = query.pageSize > 0 ? query.pageSize : DEFAULT_PAGE_SIZE;
  const brands = await getAllBrands();
  // Filters and facets use the active list above; labels use every brand, so a
  // hidden manufacturer still prints its name on the cards that reference it.
  const allBrands = await getAllBrandsIncludingInactive();
  const { base, dimensions, unsatisfiable } = await buildFilters(query, brands);
  if (unsatisfiable) return emptyResult(query, pageSize);

  const category = query.categorySlug ? await getCategoryBySlug(query.categorySlug) : undefined;
  const schema = category ? await getEffectiveSpecSchema(category) : [];
  const filterableSpecs = schema.filter((def) => def.filterable);

  const dimensionKeys = Object.keys(dimensions);
  const filterExcluding = (excludeKey: string | null): Filter =>
    and([...base, ...dimensionKeys.filter((k) => k !== excludeKey).map((k) => dimensions[k])]);

  const requests: { excludeKey: string; request: FacetRequest }[] = [
    { excludeKey: "brand", request: { kind: "brands" } },
    { excludeKey: "price", request: { kind: "price" } },
    { excludeKey: "stock", request: { kind: "inStock" } },
    ...filterableSpecs.map((def) => ({
      excludeKey: `spec:${def.key}`,
      request: { kind: "spec" as const, def },
    })),
  ];

  const fullFilter = filterExcluding(null);
  const fullSignature = JSON.stringify(fullFilter);

  type Group = { filter: Filter; facets: Record<string, PipelineStage.FacetPipelineStage[]> };
  const groups = new Map<string, Group>();
  groups.set(fullSignature, {
    filter: fullFilter,
    facets: {
      products: [
        { $sort: sortStage(query.sort, locale) },
        { $skip: Math.max(0, (Math.max(1, query.page) - 1) * pageSize) },
        { $limit: pageSize },
      ],
      total: [{ $count: "n" }],
    },
  });

  const facetNameFor = (request: FacetRequest) =>
    request.kind === "spec" ? specFacetKey(request.def.key) : request.kind;

  for (const { excludeKey, request } of requests) {
    const filter = filterExcluding(excludeKey);
    const signature = JSON.stringify(filter);
    const group = groups.get(signature) ?? { filter, facets: {} };
    group.facets[facetNameFor(request)] = facetPipeline(request);
    groups.set(signature, group);
  }

  const results = await Promise.all(
    [...groups.values()].map(async (group) => {
      const [row] = await ProductModel.aggregate<FacetResult>([
        { $match: group.filter },
        { $facet: group.facets },
      ]);
      return { group, row: row ?? {} };
    }),
  );

  const merged: FacetResult = {};
  for (const { row } of results) Object.assign(merged, row);

  const brandById = new Map(allBrands.map((b) => [b.id, b]));
  const withBrand = (rows: unknown[]): Product[] =>
    rows.map((row) => {
      const product = toProduct(row as Parameters<typeof toProduct>[0]);
      const brand = brandById.get(product.brand);
      return { ...product, brandSlug: brand?.slug ?? "", brandName: brand?.name ?? "" };
    });

  const total = ((merged.total?.[0] as { n?: number } | undefined)?.n ?? 0) as number;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const requestedPage = Math.max(1, query.page);
  let page = requestedPage;
  let products = withBrand(merged.products ?? []);

  // A page beyond the end is a stale bookmark, not an error: clamp and re-read
  // rather than showing an empty grid over a non-empty result set.
  if (!products.length && total > 0 && requestedPage > totalPages) {
    page = totalPages;
    const rows = await ProductModel.aggregate([
      { $match: fullFilter },
      { $sort: sortStage(query.sort, locale) },
      { $skip: (page - 1) * pageSize },
      { $limit: pageSize },
    ]);
    products = withBrand(rows);
  }

  const priceRow = merged.price?.[0] as { min?: number | null; max?: number | null } | undefined;

  const facets: Facets = {
    brands: readBrandFacet(merged.brands ?? [], brands),
    price: {
      min: Math.floor(priceRow?.min ?? 0),
      max: Math.ceil(priceRow?.max ?? 0),
    },
    specs: filterableSpecs
      .map((def) => readSpecFacet(def, merged[specFacetKey(def.key)] ?? []))
      .filter((f): f is SpecFacet => f !== null),
    inStockCount: ((merged.inStock?.[0] as { n?: number } | undefined)?.n ?? 0) as number,
  };

  return { products, total, page, pageSize, totalPages, facets };
}

async function denormalise(rows: unknown[]): Promise<Product[]> {
  const brands = await getAllBrandsIncludingInactive();
  const brandById = new Map(brands.map((b) => [b.id, b]));
  return rows.map((row) => {
    const product = toProduct(row as Parameters<typeof toProduct>[0]);
    const brand = brandById.get(product.brand);
    return { ...product, brandSlug: brand?.slug ?? "", brandName: brand?.name ?? "" };
  });
}

export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  await connectToDatabase();
  const doc = await ProductModel.findOne({ slug, isActive: true }).lean();
  if (!doc) return undefined;
  return (await denormalise([doc]))[0];
}

/** Slugs for `generateStaticParams`. Ids and localized fields are not needed. */
export async function listActiveProductSlugs(): Promise<string[]> {
  await connectToDatabase();
  const docs = await ProductModel.find({ isActive: true }).select("slug").lean();
  return docs.map((doc) => doc.slug);
}

export async function getFeaturedProducts(limit = 8): Promise<Product[]> {
  await connectToDatabase();
  const docs = await ProductModel.find({ isActive: true, isFeatured: true })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return denormalise(docs);
}

export async function getSaleProducts(limit = 8): Promise<Product[]> {
  await connectToDatabase();
  // Deepest discount first, so the row leads with the strongest offer.
  const docs = await ProductModel.aggregate([
    { $match: { isActive: true, salePrice: { $ne: null } } },
    { $addFields: { discount: { $divide: [{ $subtract: ["$price", "$salePrice"] }, "$price"] } } },
    { $sort: { discount: -1, _id: 1 } },
    { $limit: limit },
    { $unset: "discount" },
  ]);
  return denormalise(docs);
}

export async function getRelatedProducts(product: Product, limit = 4): Promise<Product[]> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(product.category)) return [];
  // Nearest by price within the same leaf category — the closest thing to a
  // like-for-like alternative before Phase 3 can compare on embeddings.
  const docs = await ProductModel.aggregate([
    {
      $match: {
        isActive: true,
        category: new Types.ObjectId(product.category),
        _id: { $ne: new Types.ObjectId(product.id) },
      },
    },
    { $addFields: { priceGap: { $abs: { $subtract: ["$effectivePrice", product.effectivePrice] } } } },
    { $sort: { priceGap: 1, _id: 1 } },
    { $limit: limit },
    { $unset: "priceGap" },
  ]);
  return denormalise(docs);
}

/**
 * Subtree product count for every category, in one pass.
 *
 * `categoryAncestors` holds each product's ancestors *plus its own category*, so
 * unwinding and grouping by that field yields exactly the subtree count per
 * category. The header alone renders ~20 counts; asking per category would be 20
 * round trips on every page.
 */
export const countProductsPerCategory = cache(async (): Promise<Map<string, number>> => {
  await connectToDatabase();
  const rows = await ProductModel.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { isActive: true } },
    { $unwind: "$categoryAncestors" },
    { $group: { _id: "$categoryAncestors", count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [row._id.toString(), row.count]));
});

export async function countProductsInCategory(categorySlug: string): Promise<number> {
  await connectToDatabase();
  const category = await getCategoryBySlug(categorySlug);
  if (!category) return 0;
  const subtree = await getSubtreeIds(category.id);
  return ProductModel.countDocuments({
    isActive: true,
    categoryAncestors: { $in: ids(subtree) },
  });
}

/** Header autocomplete: prefix-weighted substring match, name and SKU only. */
export async function suggestProducts(term: string, locale: Locale, limit = 8): Promise<Product[]> {
  const needle = term.trim();
  if (needle.length < 2) return [];
  await connectToDatabase();
  const rx = { $regex: escapeRegex(needle), $options: "i" };
  const docs = await ProductModel.find({
    isActive: true,
    $or: [{ sku: rx }, { [`name.${locale}`]: rx }, { "name.ka": rx }, { "name.en": rx }],
  })
    .limit(limit)
    .lean();
  return denormalise(docs);
}
