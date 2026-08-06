import type { Locale, LocalizedString } from "./types";

/**
 * Reads a localized field for the active locale, falling back to Georgian.
 * Phase 2 keeps this exact signature — the DB stores the same subdocument shape.
 */
export function pickLocale(
  field: LocalizedString | undefined,
  locale: Locale,
): string {
  if (!field) return "";
  return field[locale]?.trim() || field.ka;
}

/** Builds a `{ka, en, ru}` value from positional args, for terse fixtures. */
export function l(ka: string, en: string, ru: string): LocalizedString {
  return { ka, en, ru };
}

function intlLocale(locale: Locale) {
  return locale === "ka" ? "ka-GE" : locale === "ru" ? "ru-RU" : "en-US";
}

/**
 * The number alone. The lari sign is rendered separately by the `<Lari />`
 * component because U+20BE has no reliable font coverage — see that file.
 */
export function formatAmount(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Plain-text price for contexts that cannot hold an element: structured data,
 * `aria-label`, `title`, metadata. Uses the ISO code, which always renders.
 */
export function formatPriceText(value: number, locale: Locale): string {
  return `${formatAmount(value, locale)} GEL`;
}

export function discountPercent(price: number, salePrice: number | null): number {
  if (!salePrice || salePrice >= price) return 0;
  return Math.round(((price - salePrice) / price) * 100);
}
