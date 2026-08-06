export const LOCALES = ["ka", "en", "ru"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ka";

/** Georgian is required; EN/RU fall back to it at read time via pickLocale(). */
export type LocalizedString = {
  ka: string;
  en?: string;
  ru?: string;
};

export type SpecType = "number" | "enum" | "bool";

export type SpecOption = {
  value: string;
  label: LocalizedString;
};

/** Drives which filter controls render for a category. Inherited from ancestors. */
export type SpecDefinition = {
  key: string;
  label: LocalizedString;
  type: SpecType;
  unit?: string;
  options?: SpecOption[];
  filterable: boolean;
  showInCard: boolean;
  order: number;
};

export type Brand = {
  id: string;
  slug: string;
  name: string;
  description?: LocalizedString;
  order: number;
  isActive: boolean;
};

export type Category = {
  id: string;
  slug: string;
  name: LocalizedString;
  description?: LocalizedString;
  parent: string | null;
  /** Materialised path, root -> parent. Makes subtree queries a single indexed lookup. */
  ancestors: string[];
  path: string;
  icon?: string;
  order: number;
  isActive: boolean;
  specSchema: SpecDefinition[];
};

/**
 * Typed values in one array. Separate fields per type (rather than a polymorphic
 * `value`) keep numeric range queries indexable without per-document casting.
 */
export type ProductSpec = {
  key: string;
  valueNumber?: number;
  valueString?: string;
  valueBool?: boolean;
};

export type ProductImage = {
  url: string;
  alt: LocalizedString;
  order: number;
};

export type StockStatus = "in_stock" | "low" | "out" | "preorder";

export type Product = {
  id: string;
  sku: string;
  slug: string;
  name: LocalizedString;
  shortDescription: LocalizedString;
  description: LocalizedString;
  brand: string;
  category: string;
  categoryAncestors: string[];
  price: number;
  salePrice: number | null;
  currency: "GEL";
  stock: number;
  stockStatus: StockStatus;
  images: ProductImage[];
  specs: ProductSpec[];
  isActive: boolean;
  isFeatured: boolean;
  createdAt: string;
};

export type CategoryNode = Category & { children: CategoryNode[] };

export type BrandFacet = {
  slug: string;
  name: string;
  count: number;
};

export type EnumBucket = {
  value: string;
  label: LocalizedString;
  count: number;
};

export type SpecFacet = {
  key: string;
  label: LocalizedString;
  type: SpecType;
  unit?: string;
  /** enum */
  buckets?: EnumBucket[];
  /** number */
  min?: number;
  max?: number;
  /** bool */
  trueCount?: number;
};

export type Facets = {
  brands: BrandFacet[];
  price: { min: number; max: number };
  specs: SpecFacet[];
  inStockCount: number;
};

export const SORT_OPTIONS = [
  "relevance",
  "price_asc",
  "price_desc",
  "newest",
  "name_asc",
] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export type ProductQuery = {
  categorySlug?: string;
  q?: string;
  brands: string[];
  priceMin?: number;
  priceMax?: number;
  /** spec key -> enum values, numeric range, or boolean */
  specs: Record<string, { values?: string[]; min?: number; max?: number; bool?: boolean }>;
  inStockOnly: boolean;
  sort: SortOption;
  page: number;
  pageSize: number;
};

export type ProductListResult = {
  products: Product[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  facets: Facets;
};
