import type { Types } from "mongoose";

import { isSiteRelativePath } from "../slides/validate";
import type {
  Brand,
  Category,
  HeroSlide,
  LocalizedString,
  Product,
  ProductImage,
  ProductSpec,
  SpecDefinition,
  StockStatus,
} from "../types";

/**
 * Lean documents crossing into React have to be plain JSON: ObjectIds and Dates
 * are not serialisable across the server/client boundary, and a stray one only
 * fails once a client component touches the prop. Mapping every read through
 * here means the storefront keeps consuming the exact Phase 1 types.
 */

type Id = Types.ObjectId | string;

export function idToString(value: Id): string {
  return typeof value === "string" ? value : value.toString();
}

type LeanLocalized = { ka?: string | null; en?: string | null; ru?: string | null } | null | undefined;

function localized(value: LeanLocalized): LocalizedString {
  return {
    ka: value?.ka ?? "",
    en: value?.en ?? undefined,
    ru: value?.ru ?? undefined,
  };
}

function optionalLocalized(value: LeanLocalized): LocalizedString | undefined {
  if (!value || (!value.ka && !value.en && !value.ru)) return undefined;
  return localized(value);
}

type LeanBrand = {
  _id: Id;
  slug: string;
  name: string;
  description?: LeanLocalized;
  order?: number;
  isActive?: boolean;
};

export function toBrand(doc: LeanBrand): Brand {
  return {
    id: idToString(doc._id),
    slug: doc.slug,
    name: doc.name,
    description: optionalLocalized(doc.description),
    order: doc.order ?? 0,
    isActive: doc.isActive ?? true,
  };
}

type LeanHeroSlide = {
  _id: Id;
  image: string;
  alt?: LeanLocalized;
  href?: string | null;
  width?: number | null;
  height?: number | null;
  order?: number;
  isActive?: boolean;
};

export function toHeroSlide(doc: LeanHeroSlide): HeroSlide {
  const href = doc.href?.trim() || undefined;
  return {
    id: idToString(doc._id),
    image: doc.image,
    alt: localized(doc.alt),
    // The write handler already checked this, but it cannot vouch for a
    // document it did not write — a legacy row, an imported dump or a restored
    // backup can still carry an absolute or javascript: href. Re-check here so
    // a bad value renders as a plain image rather than a live off-site link.
    href: href && isSiteRelativePath(href) ? href : undefined,
    width: doc.width ?? undefined,
    height: doc.height ?? undefined,
    order: doc.order ?? 0,
    isActive: doc.isActive ?? true,
  };
}

type LeanSpecDefinition = {
  key: string;
  label?: LeanLocalized;
  type: SpecDefinition["type"];
  unit?: string | null;
  options?: { value: string; label?: LeanLocalized }[] | null;
  filterable?: boolean;
  showInCard?: boolean;
  order?: number;
};

function toSpecDefinition(doc: LeanSpecDefinition): SpecDefinition {
  return {
    key: doc.key,
    label: localized(doc.label),
    type: doc.type,
    unit: doc.unit ?? undefined,
    options: doc.options?.map((o) => ({ value: o.value, label: localized(o.label) })),
    filterable: doc.filterable ?? true,
    showInCard: doc.showInCard ?? false,
    order: doc.order ?? 0,
  };
}

type LeanCategory = {
  _id: Id;
  slug: string;
  name?: LeanLocalized;
  description?: LeanLocalized;
  parent?: Id | null;
  ancestors?: Id[];
  path: string;
  icon?: string | null;
  order?: number;
  isActive?: boolean;
  specSchema?: LeanSpecDefinition[] | null;
};

export function toCategory(doc: LeanCategory): Category {
  return {
    id: idToString(doc._id),
    slug: doc.slug,
    name: localized(doc.name),
    description: optionalLocalized(doc.description),
    parent: doc.parent ? idToString(doc.parent) : null,
    ancestors: (doc.ancestors ?? []).map(idToString),
    path: doc.path,
    icon: doc.icon ?? undefined,
    order: doc.order ?? 0,
    isActive: doc.isActive ?? true,
    specSchema: (doc.specSchema ?? []).map(toSpecDefinition),
  };
}

type LeanProduct = {
  _id: Id;
  sku: string;
  slug: string;
  name?: LeanLocalized;
  shortDescription?: LeanLocalized;
  description?: LeanLocalized;
  brand: Id;
  /** Supplied by the `$lookup` stage in the listing pipeline. */
  brandSlug?: string | null;
  brandName?: string | null;
  category: Id;
  categoryAncestors?: Id[];
  price: number;
  salePrice?: number | null;
  effectivePrice?: number | null;
  stock?: number;
  stockStatus?: StockStatus;
  images?: { url: string; alt?: LeanLocalized; order?: number }[] | null;
  specs?: { key: string; valueNumber?: number | null; valueString?: string | null; valueBool?: boolean | null }[] | null;
  isActive?: boolean;
  isFeatured?: boolean;
  createdAt?: Date | string;
};

function toImage(doc: NonNullable<LeanProduct["images"]>[number]): ProductImage {
  return { url: doc.url, alt: localized(doc.alt), order: doc.order ?? 0 };
}

function toSpec(doc: NonNullable<LeanProduct["specs"]>[number]): ProductSpec {
  return {
    key: doc.key,
    valueNumber: doc.valueNumber ?? undefined,
    valueString: doc.valueString ?? undefined,
    valueBool: doc.valueBool ?? undefined,
  };
}

export function toProduct(doc: LeanProduct): Product {
  const salePrice = doc.salePrice ?? null;
  return {
    id: idToString(doc._id),
    sku: doc.sku,
    slug: doc.slug,
    name: localized(doc.name),
    shortDescription: localized(doc.shortDescription),
    description: localized(doc.description),
    brand: idToString(doc.brand),
    brandSlug: doc.brandSlug ?? "",
    brandName: doc.brandName ?? "",
    category: idToString(doc.category),
    categoryAncestors: (doc.categoryAncestors ?? []).map(idToString),
    price: doc.price,
    salePrice,
    effectivePrice: doc.effectivePrice ?? salePrice ?? doc.price,
    currency: "GEL",
    stock: doc.stock ?? 0,
    stockStatus: doc.stockStatus ?? "out",
    images: (doc.images ?? []).map(toImage).sort((a, b) => a.order - b.order),
    specs: (doc.specs ?? []).map(toSpec),
    isActive: doc.isActive ?? true,
    isFeatured: doc.isFeatured ?? false,
    createdAt:
      doc.createdAt instanceof Date
        ? doc.createdAt.toISOString().slice(0, 10)
        : (doc.createdAt ?? ""),
  };
}
