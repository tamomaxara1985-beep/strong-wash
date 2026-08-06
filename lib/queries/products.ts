import { getBrandById, getBrandBySlug, brands as allBrands } from "../mock/brands";
import {
  getCategoryBySlug,
  getEffectiveSpecSchema,
  getSubtreeIds,
} from "../mock/categories";
import { products } from "../mock/products";
import type {
  BrandFacet,
  Facets,
  Product,
  ProductListResult,
  ProductQuery,
  SpecDefinition,
  SpecFacet,
} from "../types";

export const DEFAULT_PAGE_SIZE = 12;

function specOf(product: Product, key: string) {
  return product.specs.find((s) => s.key === key);
}

/**
 * Matches one spec constraint against a product.
 *
 * This is the mock equivalent of a single `$elemMatch`. Filtering on several
 * different spec keys must AND together *separate* element matches — a flat
 * `{'specs.key': k, 'specs.valueNumber': v}` in Mongo would match a product
 * where one element supplies the key and a different element supplies the
 * value, which is a false positive. Keeping one predicate per key here mirrors
 * the shape Phase 2 has to produce.
 */
function matchesSpec(
  product: Product,
  key: string,
  constraint: { values?: string[]; min?: number; max?: number; bool?: boolean },
): boolean {
  const spec = specOf(product, key);
  if (!spec) return false;

  if (constraint.values?.length) {
    return spec.valueString != null && constraint.values.includes(spec.valueString);
  }
  if (constraint.bool !== undefined) {
    return spec.valueBool === constraint.bool;
  }
  if (constraint.min !== undefined || constraint.max !== undefined) {
    if (spec.valueNumber == null) return false;
    if (constraint.min !== undefined && spec.valueNumber < constraint.min) return false;
    if (constraint.max !== undefined && spec.valueNumber > constraint.max) return false;
  }
  return true;
}

type Predicate = (product: Product) => boolean;

/**
 * "In stock" means a unit is physically held. Built-to-order systems are
 * neither in stock nor unavailable — treating `preorder` as in-stock would
 * report a shelf count for a machine with a ten-week lead time.
 */
function isHeldInStock(product: Product): boolean {
  return product.stockStatus === "in_stock" || product.stockStatus === "low";
}

/**
 * Builds the predicate set as separate named dimensions so a facet can be
 * counted with its *own* dimension excluded. Counting every facet under the
 * full filter would report 0 for each unselected brand, making them
 * unclickable — the classic faceted-search dead end.
 */
function buildPredicates(query: ProductQuery) {
  const base: Predicate[] = [(p) => p.isActive];

  if (query.categorySlug) {
    const category = getCategoryBySlug(query.categorySlug);
    if (!category) {
      return { base: [() => false] as Predicate[], dimensions: {} as Record<string, Predicate> };
    }
    const subtree = new Set(getSubtreeIds(category.id));
    base.push((p) => p.categoryAncestors.some((id) => subtree.has(id)));
  }

  if (query.q) {
    const needle = query.q.trim().toLowerCase();
    if (needle) {
      base.push((p) => {
        const brand = getBrandById(p.brand);
        const haystack = [
          p.sku,
          p.slug,
          p.name.ka,
          p.name.en ?? "",
          p.name.ru ?? "",
          p.shortDescription.ka,
          p.shortDescription.en ?? "",
          p.shortDescription.ru ?? "",
          brand?.name ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      });
    }
  }

  const dimensions: Record<string, Predicate> = {};

  if (query.brands.length) {
    const wanted = new Set(
      query.brands
        .map((slug) => getBrandBySlug(slug)?.id)
        .filter((id): id is string => Boolean(id)),
    );
    dimensions.brand = (p) => wanted.has(p.brand);
  }

  if (query.priceMin !== undefined || query.priceMax !== undefined) {
    dimensions.price = (p) => {
      const effective = p.salePrice ?? p.price;
      if (query.priceMin !== undefined && effective < query.priceMin) return false;
      if (query.priceMax !== undefined && effective > query.priceMax) return false;
      return true;
    };
  }

  if (query.inStockOnly) {
    dimensions.stock = isHeldInStock;
  }

  for (const [key, constraint] of Object.entries(query.specs)) {
    dimensions[`spec:${key}`] = (p) => matchesSpec(p, key, constraint);
  }

  return { base, dimensions };
}

function applyAll(list: Product[], predicates: Predicate[]): Product[] {
  return list.filter((p) => predicates.every((fn) => fn(p)));
}

function sortProducts(list: Product[], sort: ProductQuery["sort"], locale: "ka" | "en" | "ru") {
  const sorted = [...list];
  const effective = (p: Product) => p.salePrice ?? p.price;

  switch (sort) {
    case "price_asc":
      return sorted.sort((a, b) => effective(a) - effective(b));
    case "price_desc":
      return sorted.sort((a, b) => effective(b) - effective(a));
    case "newest":
      return sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case "name_asc":
      return sorted.sort((a, b) =>
        (a.name[locale] ?? a.name.ka).localeCompare(b.name[locale] ?? b.name.ka, locale),
      );
    case "relevance":
    default:
      // Featured first, then in-stock, then newest. Phase 3 replaces this with
      // a hybrid lexical + vector score.
      return sorted.sort((a, b) => {
        if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
        const aOut = a.stockStatus === "out";
        const bOut = b.stockStatus === "out";
        if (aOut !== bOut) return aOut ? 1 : -1;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }
}

function buildBrandFacet(pool: Product[]): BrandFacet[] {
  const counts = new Map<string, number>();
  for (const p of pool) {
    counts.set(p.brand, (counts.get(p.brand) ?? 0) + 1);
  }
  return allBrands
    .filter((b) => counts.has(b.id))
    .map((b) => ({ slug: b.slug, name: b.name, count: counts.get(b.id) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function buildSpecFacet(def: SpecDefinition, pool: Product[]): SpecFacet | null {
  const values = pool
    .map((p) => specOf(p, def.key))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  if (!values.length) return null;

  if (def.type === "enum") {
    const counts = new Map<string, number>();
    for (const v of values) {
      if (v.valueString == null) continue;
      counts.set(v.valueString, (counts.get(v.valueString) ?? 0) + 1);
    }
    const buckets = (def.options ?? [])
      .filter((o) => counts.has(o.value))
      .map((o) => ({ value: o.value, label: o.label, count: counts.get(o.value) ?? 0 }));
    if (!buckets.length) return null;
    return { key: def.key, label: def.label, type: "enum", unit: def.unit, buckets };
  }

  if (def.type === "bool") {
    const trueCount = values.filter((v) => v.valueBool === true).length;
    if (!trueCount) return null;
    return { key: def.key, label: def.label, type: "bool", trueCount };
  }

  const numbers = values
    .map((v) => v.valueNumber)
    .filter((n): n is number => typeof n === "number");
  if (!numbers.length) return null;
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  if (min === max) return null; // A single value is not a useful range control.
  return { key: def.key, label: def.label, type: "number", unit: def.unit, min, max };
}

export function queryProducts(
  query: ProductQuery,
  locale: "ka" | "en" | "ru" = "ka",
): ProductListResult {
  const { base, dimensions } = buildPredicates(query);
  const dimensionKeys = Object.keys(dimensions);

  // Pool used for the result set: base + every dimension.
  const fullPool = applyAll(products, [...base, ...dimensionKeys.map((k) => dimensions[k])]);

  // Per-facet pool: base + every dimension EXCEPT the one being counted.
  const poolExcluding = (excludeKey: string) =>
    applyAll(products, [
      ...base,
      ...dimensionKeys.filter((k) => k !== excludeKey).map((k) => dimensions[k]),
    ]);

  const category = query.categorySlug ? getCategoryBySlug(query.categorySlug) : undefined;
  const schema = category ? getEffectiveSpecSchema(category) : [];

  const brandPool = poolExcluding("brand");
  const pricePool = poolExcluding("price");
  const stockPool = poolExcluding("stock");

  const priceValues = pricePool.map((p) => p.salePrice ?? p.price);

  const facets: Facets = {
    brands: buildBrandFacet(brandPool),
    price: {
      min: priceValues.length ? Math.floor(Math.min(...priceValues)) : 0,
      max: priceValues.length ? Math.ceil(Math.max(...priceValues)) : 0,
    },
    specs: schema
      .filter((def) => def.filterable)
      .map((def) => buildSpecFacet(def, poolExcluding(`spec:${def.key}`)))
      .filter((f): f is SpecFacet => f !== null),
    inStockCount: stockPool.filter(isHeldInStock).length,
  };

  const sorted = sortProducts(fullPool, query.sort, locale);
  const pageSize = query.pageSize > 0 ? query.pageSize : DEFAULT_PAGE_SIZE;
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, query.page), totalPages);
  const start = (page - 1) * pageSize;

  return {
    products: sorted.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages,
    facets,
  };
}

export function getFeaturedProducts(limit = 8): Product[] {
  return products
    .filter((p) => p.isActive && p.isFeatured)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function getSaleProducts(limit = 8): Product[] {
  return products
    .filter((p) => p.isActive && p.salePrice !== null)
    .sort((a, b) => {
      const da = (a.price - (a.salePrice ?? a.price)) / a.price;
      const db = (b.price - (b.salePrice ?? b.price)) / b.price;
      return db - da;
    })
    .slice(0, limit);
}

export function getRelatedProducts(product: Product, limit = 4): Product[] {
  return products
    .filter((p) => p.isActive && p.id !== product.id && p.category === product.category)
    .sort((a, b) => Math.abs(a.price - product.price) - Math.abs(b.price - product.price))
    .slice(0, limit);
}

export function countProductsInCategory(categorySlug: string): number {
  const category = getCategoryBySlug(categorySlug);
  if (!category) return 0;
  const subtree = new Set(getSubtreeIds(category.id));
  return products.filter(
    (p) => p.isActive && p.categoryAncestors.some((id) => subtree.has(id)),
  ).length;
}
