import { Search } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { ActiveFilters } from "@/components/catalog/active-filters";
import { CatalogPagination } from "@/components/catalog/catalog-pagination";
import { FilterControls } from "@/components/catalog/filter-controls";
import { FilterSheet } from "@/components/catalog/filter-sheet";
import { ProductGrid } from "@/components/catalog/product-grid";
import { SortSelect } from "@/components/catalog/sort-select";
import { SearchForm } from "@/components/layout/search-form";
import { queryProducts } from "@/lib/queries/products";
import { parseProductQuery, type RawSearchParams } from "@/lib/queries/search-params";
import type { Locale } from "@/lib/types";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/search">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "search" });
  return {
    title: t("title"),
    // Search result pages should not compete with category pages in the index.
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({
  params,
  searchParams,
}: PageProps<"/[locale]/search">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const raw = (await searchParams) as RawSearchParams;
  const t = await getTranslations();
  const typedLocale = locale as Locale;

  // No category scope here, so there is no category spec schema to filter with.
  // Brand, price and availability facets still apply across the whole catalogue.
  const query = parseProductQuery(raw);
  const result = queryProducts(query, typedLocale);
  const basePath = "/search";

  return (
    <div className="container-page py-6">
      <header className="mb-6">
        <h1 className="text-display text-2xl sm:text-3xl">{t("search.title")}</h1>
        <div className="mt-4 max-w-2xl">
          <SearchForm defaultValue={query.q ?? ""} />
        </div>
        {query.q ? (
          <p className="text-muted-foreground mt-3 text-sm">
            {t("search.queryLabel")}: <span className="text-foreground font-semibold">{query.q}</span>
          </p>
        ) : null}
      </header>

      {!query.q && result.total === 0 ? (
        <div className="bg-card rounded-lg border px-6 py-16 text-center">
          <Search aria-hidden className="text-muted-foreground mx-auto size-8" />
          <p className="text-display mt-3 text-lg">{t("search.emptyTitle")}</p>
          <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm">
            {t("search.emptyHint")}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
          <aside className="hidden lg:block">
            <div className="bg-card sticky top-32 rounded-lg border px-4">
              <FilterControls
                facets={result.facets}
                query={query}
                basePath={basePath}
                locale={typedLocale}
                idScope="rail"
              />
            </div>
          </aside>

          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <FilterSheet
                  facets={result.facets}
                  query={query}
                  basePath={basePath}
                  locale={typedLocale}
                  total={result.total}
                />
                <p className="text-muted-foreground text-sm">
                  {t("catalog.resultsCount", { count: result.total })}
                </p>
              </div>
              <SortSelect query={query} basePath={basePath} />
            </div>

            <div className="mb-4">
              <ActiveFilters
                facets={result.facets}
                query={query}
                basePath={basePath}
                locale={typedLocale}
              />
            </div>

            {result.products.length ? (
              <>
                <ProductGrid products={result.products} locale={typedLocale} />
                <CatalogPagination
                  query={query}
                  basePath={basePath}
                  page={result.page}
                  totalPages={result.totalPages}
                />
              </>
            ) : (
              <div className="bg-card rounded-lg border px-6 py-16 text-center">
                <p className="text-display text-lg">{t("catalog.noResults")}</p>
                <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm">
                  {t("catalog.noResultsHint")}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
