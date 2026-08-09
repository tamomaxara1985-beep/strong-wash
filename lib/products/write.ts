import { Types } from "mongoose";

import { pickLocale } from "../localized";
import { Brand } from "../models/brand";
import { Category } from "../models/category";
import { getEffectiveSpecSchema } from "../queries/categories";
import { toCategory } from "../queries/map";
import { LOCALES, type LocalizedString, type ProductSpec, type StockStatus } from "../types";

/**
 * The write side of a product: everything the storefront reads but nobody should
 * have to type.
 *
 * Kept out of the route handler because three things here are easy to get wrong
 * and expensive to notice later — spec values that do not match the category's
 * schema vanish silently from the facets, `categoryAncestors` decides whether a
 * product appears under its parent categories at all, and a stale `searchText`
 * means the product cannot be found by name.
 */

export type ProductInput = {
  sku: string;
  slug: string;
  name: LocalizedString;
  shortDescription: LocalizedString;
  description: LocalizedString;
  brandId: string;
  categoryId: string;
  price: number;
  salePrice: number | null;
  stock: number;
  stockStatus: StockStatus;
  images: { url: string; alt: LocalizedString; order: number }[];
  /** Raw values keyed by spec key, as the form submits them. */
  specs: Record<string, string | number | boolean>;
  isActive: boolean;
  isFeatured: boolean;
};

export type BuildFailure = { field: string; code: string };

export type BuiltProduct = {
  sku: string;
  slug: string;
  name: LocalizedString;
  shortDescription: LocalizedString;
  description: LocalizedString;
  brand: Types.ObjectId;
  category: Types.ObjectId;
  categoryAncestors: Types.ObjectId[];
  price: number;
  salePrice: number | null;
  stock: number;
  stockStatus: StockStatus;
  images: { url: string; alt: LocalizedString; order: number }[];
  specs: ProductSpec[];
  searchText: LocalizedString;
  isActive: boolean;
  isFeatured: boolean;
};

/**
 * Coerces one submitted value into the typed field its schema declares.
 *
 * An enum value not present in the definition's options is rejected rather than
 * stored: it would satisfy the filter query shape but never match a facet
 * bucket, so the product would silently disappear from filtered views.
 */
function toSpec(
  def: { key: string; type: string; options?: { value: string }[] },
  raw: string | number | boolean,
): ProductSpec | BuildFailure {
  const field = `specs.${def.key}`;

  if (def.type === "number") {
    const value = typeof raw === "number" ? raw : Number(String(raw).trim());
    if (!Number.isFinite(value)) return { field, code: "not_a_number" };
    return { key: def.key, valueNumber: value };
  }

  if (def.type === "bool") {
    const value = typeof raw === "boolean" ? raw : String(raw) === "true";
    return { key: def.key, valueBool: value };
  }

  const value = String(raw).trim();
  const allowed = def.options?.some((option) => option.value === value);
  if (!allowed) return { field, code: "not_an_option" };
  return { key: def.key, valueString: value };
}

function isFailure(value: unknown): value is BuildFailure {
  return typeof value === "object" && value !== null && "code" in value && "field" in value;
}

/**
 * Denormalised haystack for the substring search, per locale.
 *
 * Exported because the brand write path rebuilds it too: `brandName` is baked in
 * here, so renaming a brand leaves every one of its products advertising the old
 * manufacturer. The parameter is narrowed to the three fields actually read so a
 * stored document can be passed as readily as a `ProductInput`.
 */
export function buildSearchText(
  input: { name: LocalizedString; sku: string; shortDescription?: LocalizedString },
  brandName: string,
  specs: ProductSpec[],
): LocalizedString {
  const parts = (locale: (typeof LOCALES)[number]) =>
    [
      pickLocale(input.name, locale),
      brandName,
      input.sku,
      pickLocale(input.shortDescription, locale),
      ...specs.map((spec) =>
        [spec.key, spec.valueString, spec.valueNumber, spec.valueBool]
          .filter((v) => v !== undefined && v !== null && v !== false)
          .join(" "),
      ),
    ]
      .filter(Boolean)
      .join(" ");

  return { ka: parts("ka"), en: parts("en"), ru: parts("ru") };
}

/**
 * Validates references and derives every computed field.
 *
 * Returns failures rather than throwing so the route can report them per field
 * and the form can point at the offending input.
 */
export async function buildProduct(
  input: ProductInput,
): Promise<{ product: BuiltProduct } | { failures: BuildFailure[] }> {
  const failures: BuildFailure[] = [];

  if (!Types.ObjectId.isValid(input.brandId)) failures.push({ field: "brandId", code: "invalid" });
  if (!Types.ObjectId.isValid(input.categoryId)) {
    failures.push({ field: "categoryId", code: "invalid" });
  }
  if (failures.length) return { failures };

  const [brand, categoryDoc] = await Promise.all([
    Brand.findById(input.brandId).select("name").lean(),
    Category.findById(input.categoryId).lean(),
  ]);

  if (!brand) failures.push({ field: "brandId", code: "not_found" });
  if (!categoryDoc) failures.push({ field: "categoryId", code: "not_found" });
  if (!brand || !categoryDoc) return { failures };

  const category = toCategory(categoryDoc);
  const schema = await getEffectiveSpecSchema(category);
  const byKey = new Map(schema.map((def) => [def.key, def]));

  const specs: ProductSpec[] = [];
  for (const [key, raw] of Object.entries(input.specs)) {
    // Blank inputs mean "not specified" rather than an error: most products do
    // not carry every attribute their category allows.
    if (raw === "" || raw === null || raw === undefined) continue;

    const def = byKey.get(key);
    if (!def) {
      failures.push({ field: `specs.${key}`, code: "not_in_schema" });
      continue;
    }
    const result = toSpec(def, raw);
    if (isFailure(result)) failures.push(result);
    else specs.push(result);
  }

  if (input.salePrice !== null && input.salePrice >= input.price) {
    // A "sale" price at or above the list price is a data-entry slip that would
    // render a discount badge of 0%.
    failures.push({ field: "salePrice", code: "not_below_price" });
  }

  if (failures.length) return { failures };

  return {
    product: {
      sku: input.sku,
      slug: input.slug,
      name: input.name,
      shortDescription: input.shortDescription,
      description: input.description,
      brand: new Types.ObjectId(input.brandId),
      category: new Types.ObjectId(input.categoryId),
      /**
       * The category's own ancestors plus itself. This is what makes a product
       * appear under every parent category, so it is derived here rather than
       * trusted from the client.
       */
      categoryAncestors: [
        ...category.ancestors.map((id) => new Types.ObjectId(id)),
        new Types.ObjectId(category.id),
      ],
      price: input.price,
      salePrice: input.salePrice,
      stock: input.stock,
      stockStatus: input.stockStatus,
      images: input.images.map((image, index) => ({ ...image, order: index + 1 })),
      specs,
      searchText: buildSearchText(input, brand.name, specs),
      isActive: input.isActive,
      isFeatured: input.isFeatured,
    },
  };
}
