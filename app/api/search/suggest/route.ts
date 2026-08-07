import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api";
import { pickLocale } from "@/lib/localized";
import { suggestProducts } from "@/lib/queries/products";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/types";

/**
 * Header autocomplete. Deliberately thin: name and SKU substring only, and the
 * response carries just what a suggestion row draws. Phase 3 swaps the matcher
 * for hybrid lexical + vector search behind this same shape.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const term = params.get("q") ?? "";
    const localeParam = params.get("locale");
    const locale: Locale = LOCALES.includes(localeParam as Locale)
      ? (localeParam as Locale)
      : DEFAULT_LOCALE;

    const products = await suggestProducts(term, locale, 8);

    return NextResponse.json({
      suggestions: products.map((product) => ({
        slug: product.slug,
        sku: product.sku,
        name: pickLocale(product.name, locale),
        brand: product.brandName,
        price: product.effectivePrice,
        image: product.images[0]?.url ?? null,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
