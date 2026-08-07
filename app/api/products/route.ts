import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, notFoundJson } from "@/lib/api";
import { getCategoryBySlug, getEffectiveSpecSchema } from "@/lib/queries/categories";
import { queryProducts } from "@/lib/queries/products";
import { parseProductQuery, type RawSearchParams } from "@/lib/queries/search-params";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/types";

function toRawParams(searchParams: URLSearchParams): RawSearchParams {
  const raw: RawSearchParams = {};
  for (const key of new Set(searchParams.keys())) {
    const all = searchParams.getAll(key);
    raw[key] = all.length > 1 ? all : all[0];
  }
  return raw;
}

/**
 * Faceted listing. Consumes the Phase 1 query contract verbatim — the same
 * `?brand=a,b&price=1000-5000&spec.pressure=150-500&sort=price_asc&page=2` the
 * storefront puts in the URL — so a client filter interaction and a server
 * render agree by construction.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const localeParam = params.get("locale");
    const locale: Locale = LOCALES.includes(localeParam as Locale)
      ? (localeParam as Locale)
      : DEFAULT_LOCALE;

    const categorySlug = params.get("category") ?? undefined;
    // Spec parsing needs the declared type of each key: `150-500` is a range for
    // a number spec and a literal enum value for an enum spec.
    const category = categorySlug ? await getCategoryBySlug(categorySlug) : undefined;
    if (categorySlug && !category) {
      // Dropping an unresolvable scope would answer with the entire catalogue —
      // a silently wrong 200 is worse than a 404 for a caller paginating a
      // category that no longer exists.
      return notFoundJson("category");
    }
    const schema = category ? await getEffectiveSpecSchema(category) : [];

    const query = parseProductQuery(toRawParams(params), {
      categorySlug: category?.slug,
      schema,
    });

    const result = await queryProducts(query, locale);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
