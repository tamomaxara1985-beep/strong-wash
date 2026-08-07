import { pickLocale } from "./localized";
import type { Locale, Product, ProductSpec, SpecDefinition } from "./types";

/**
 * Resolves a category id to its effective spec schema, synchronously.
 *
 * Spec definitions now live in the database, but formatting a product's specs is
 * pure display logic that runs inside render. Taking a prepared lookup keeps
 * this module free of I/O: the caller awaits `getSpecSchemaLookup()` once per
 * request and every card resolves against the same in-memory tree.
 */
export type SpecSchemaLookup = (categoryId: string) => SpecDefinition[];

export type ResolvedSpec = {
  key: string;
  label: string;
  /** Human-readable value including unit, e.g. "1400 rpm". */
  display: string;
  /** Raw enum value, kept so the energy label can render its own chevron. */
  rawValue?: string;
  definition: SpecDefinition;
};

function formatValue(
  def: SpecDefinition,
  spec: ProductSpec,
  locale: Locale,
  labels: { yes: string; no: string },
): string {
  switch (def.type) {
    case "number": {
      if (spec.valueNumber == null) return "";
      const num = new Intl.NumberFormat(
        locale === "ka" ? "ka-GE" : locale === "ru" ? "ru-RU" : "en-US",
        { maximumFractionDigits: 2 },
      ).format(spec.valueNumber);
      return def.unit ? `${num} ${def.unit}` : num;
    }
    case "bool":
      return spec.valueBool ? labels.yes : labels.no;
    case "enum": {
      const option = def.options?.find((o) => o.value === spec.valueString);
      return option ? pickLocale(option.label, locale) : (spec.valueString ?? "");
    }
  }
}

/** Every spec on a product, in schema order, resolved for display. */
export function resolveSpecs(
  product: Product,
  locale: Locale,
  labels: { yes: string; no: string },
  lookup: SpecSchemaLookup,
): ResolvedSpec[] {
  return lookup(product.category)
    .map((def): ResolvedSpec | null => {
      const spec = product.specs.find((s) => s.key === def.key);
      if (!spec) return null;
      const display = formatValue(def, spec, locale, labels);
      if (!display) return null;
      return {
        key: def.key,
        label: pickLocale(def.label, locale),
        display,
        rawValue: spec.valueString,
        definition: def,
      };
    })
    .filter((s): s is ResolvedSpec => s !== null);
}

/**
 * The subset flagged `showInCard`, capped at `limit`. This is what the card's
 * spec strip renders — the numbers an appliance shopper actually compares.
 */
export function getCardSpecs(
  product: Product,
  locale: Locale,
  labels: { yes: string; no: string },
  lookup: SpecSchemaLookup,
  limit = 3,
): ResolvedSpec[] {
  return resolveSpecs(product, locale, labels, lookup)
    .filter((s) => s.definition.showInCard)
    .slice(0, limit);
}
