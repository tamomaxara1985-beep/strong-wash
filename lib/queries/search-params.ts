import { DEFAULT_PAGE_SIZE } from "./products";
import { SORT_OPTIONS, type ProductQuery, type SortOption, type SpecDefinition } from "../types";

export type RawSearchParams = Record<string, string | string[] | undefined>;

const SPEC_PREFIX = "spec.";

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseList(value: string | string[] | undefined): string[] {
  const raw = first(value);
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Parses `500-2000`, `500-`, `-2000` into a numeric range. */
function parseRange(raw: string | undefined): { min?: number; max?: number } {
  if (!raw) return {};
  const [minRaw, maxRaw] = raw.split("-", 2);
  const min = minRaw !== undefined && minRaw !== "" ? Number(minRaw) : undefined;
  const max = maxRaw !== undefined && maxRaw !== "" ? Number(maxRaw) : undefined;
  return {
    min: Number.isFinite(min) ? min : undefined,
    max: Number.isFinite(max) ? max : undefined,
  };
}

function parseSort(value: string | string[] | undefined): SortOption {
  const raw = first(value);
  return SORT_OPTIONS.includes(raw as SortOption) ? (raw as SortOption) : "relevance";
}

function parsePage(value: string | string[] | undefined): number {
  const raw = Number(first(value));
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
}

/**
 * Turns the query string into a ProductQuery. The spec schema is required
 * because `spec.pressure=150-500` and `spec.waterTemp=hot,cold` are only
 * distinguishable by the declared type of that spec.
 */
export function parseProductQuery(
  params: RawSearchParams,
  options: {
    categorySlug?: string;
    schema?: SpecDefinition[];
    pageSize?: number;
  } = {},
): ProductQuery {
  const { categorySlug, schema = [], pageSize = DEFAULT_PAGE_SIZE } = options;
  const byKey = new Map(schema.map((s) => [s.key, s]));

  const specs: ProductQuery["specs"] = {};
  for (const [param, value] of Object.entries(params)) {
    if (!param.startsWith(SPEC_PREFIX)) continue;
    const key = param.slice(SPEC_PREFIX.length);
    const def = byKey.get(key);
    if (!def || !def.filterable) continue;

    if (def.type === "enum") {
      const values = parseList(value).filter((v) =>
        def.options?.some((o) => o.value === v),
      );
      if (values.length) specs[key] = { values };
    } else if (def.type === "bool") {
      const raw = first(value);
      if (raw === "1" || raw === "true") specs[key] = { bool: true };
      else if (raw === "0" || raw === "false") specs[key] = { bool: false };
    } else {
      const range = parseRange(first(value));
      if (range.min !== undefined || range.max !== undefined) specs[key] = range;
    }
  }

  const price = parseRange(first(params.price));
  const inStockRaw = first(params.inStock);

  return {
    categorySlug,
    q: first(params.q)?.trim() || undefined,
    brands: parseList(params.brand),
    priceMin: price.min,
    priceMax: price.max,
    specs,
    inStockOnly: inStockRaw === "1" || inStockRaw === "true",
    sort: parseSort(params.sort),
    page: parsePage(params.page),
    pageSize,
  };
}

/**
 * Serialises a ProductQuery back to a query string. Omits defaults so canonical
 * URLs stay short, and always drops `page` when it is 1.
 */
export function buildSearchParams(query: ProductQuery): URLSearchParams {
  const params = new URLSearchParams();

  if (query.q) params.set("q", query.q);
  if (query.brands.length) params.set("brand", query.brands.join(","));

  if (query.priceMin !== undefined || query.priceMax !== undefined) {
    params.set("price", `${query.priceMin ?? ""}-${query.priceMax ?? ""}`);
  }

  for (const [key, constraint] of Object.entries(query.specs)) {
    if (constraint.values?.length) {
      params.set(`${SPEC_PREFIX}${key}`, constraint.values.join(","));
    } else if (constraint.bool !== undefined) {
      params.set(`${SPEC_PREFIX}${key}`, constraint.bool ? "1" : "0");
    } else if (constraint.min !== undefined || constraint.max !== undefined) {
      params.set(
        `${SPEC_PREFIX}${key}`,
        `${constraint.min ?? ""}-${constraint.max ?? ""}`,
      );
    }
  }

  if (query.inStockOnly) params.set("inStock", "1");
  if (query.sort !== "relevance") params.set("sort", query.sort);
  if (query.page > 1) params.set("page", String(query.page));

  return params;
}

export function queryToHref(pathname: string, query: ProductQuery): string {
  const params = buildSearchParams(query);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Immutable helpers used by the client-side filter controls. */
export const mutate = {
  toggleBrand(query: ProductQuery, slug: string): ProductQuery {
    const brands = query.brands.includes(slug)
      ? query.brands.filter((b) => b !== slug)
      : [...query.brands, slug];
    return { ...query, brands, page: 1 };
  },

  setPrice(query: ProductQuery, min?: number, max?: number): ProductQuery {
    return { ...query, priceMin: min, priceMax: max, page: 1 };
  },

  toggleSpecValue(query: ProductQuery, key: string, value: string): ProductQuery {
    const current = query.specs[key]?.values ?? [];
    const values = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    const specs = { ...query.specs };
    if (values.length) specs[key] = { values };
    else delete specs[key];
    return { ...query, specs, page: 1 };
  },

  setSpecRange(query: ProductQuery, key: string, min?: number, max?: number): ProductQuery {
    const specs = { ...query.specs };
    if (min === undefined && max === undefined) delete specs[key];
    else specs[key] = { min, max };
    return { ...query, specs, page: 1 };
  },

  setSpecBool(query: ProductQuery, key: string, value: boolean | undefined): ProductQuery {
    const specs = { ...query.specs };
    if (value === undefined) delete specs[key];
    else specs[key] = { bool: value };
    return { ...query, specs, page: 1 };
  },

  setInStockOnly(query: ProductQuery, value: boolean): ProductQuery {
    return { ...query, inStockOnly: value, page: 1 };
  },

  setSort(query: ProductQuery, sort: SortOption): ProductQuery {
    return { ...query, sort, page: 1 };
  },

  setPage(query: ProductQuery, page: number): ProductQuery {
    return { ...query, page };
  },

  clearFilters(query: ProductQuery): ProductQuery {
    return {
      ...query,
      brands: [],
      priceMin: undefined,
      priceMax: undefined,
      specs: {},
      inStockOnly: false,
      page: 1,
    };
  },
};

export function hasActiveFilters(query: ProductQuery): boolean {
  return (
    query.brands.length > 0 ||
    query.priceMin !== undefined ||
    query.priceMax !== undefined ||
    Object.keys(query.specs).length > 0 ||
    query.inStockOnly
  );
}
