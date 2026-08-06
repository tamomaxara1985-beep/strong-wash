import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { ActiveFilters } from "@/components/catalog/active-filters";
import { CatalogPagination } from "@/components/catalog/catalog-pagination";
import { FilterControls } from "@/components/catalog/filter-controls";
import { FilterSheet } from "@/components/catalog/filter-sheet";
import { ProductGrid } from "@/components/catalog/product-grid";
import { SortSelect } from "@/components/catalog/sort-select";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { pickLocale } from "@/lib/localized";
import {
  categories,
  getCategoryBySlug,
  getCategoryTrail,
  getChildren,
  getEffectiveSpecSchema,
} from "@/lib/mock/categories";
import { countProductsInCategory, queryProducts } from "@/lib/queries/products";
import { parseProductQuery, type RawSearchParams } from "@/lib/queries/search-params";
import type { Locale } from "@/lib/types";

/**
 * The route is a catch-all so `/c/automatic-systems/rollover-machines` resolves, but
 * only the *last* segment identifies the category — slugs are globally unique,
 * exactly as they are in the Phase 2 collection.
 */
function resolveCategory(slug: string[]) {
  const leaf = slug[slug.length - 1];
  return leaf ? getCategoryBySlug(leaf) : undefined;
}

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    categories
      .filter((category) => category.isActive)
      .map((category) => ({
        locale,
        slug: category.path.replace(/^\//, "").split("/"),
      })),
  );
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/c/[...slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const category = resolveCategory(slug);
  if (!category) return {};

  const name = pickLocale(category.name, locale as Locale);
  const description = category.description
    ? pickLocale(category.description, locale as Locale)
    : undefined;

  return {
    title: name,
    description,
    alternates: {
      canonical: `/${locale}/c${category.path}`,
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, `/${l}/c${category.path}`]),
      ),
    },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: PageProps<"/[locale]/c/[...slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const category = resolveCategory(slug);
  if (!category) notFound();

  const raw = (await searchParams) as RawSearchParams;
  const t = await getTranslations();
  const typedLocale = locale as Locale;

  const schema = getEffectiveSpecSchema(category);
  const query = parseProductQuery(raw, {
    categorySlug: category.slug,
    schema,
  });
  const result = queryProducts(query, typedLocale);

  const trail = getCategoryTrail(category);
  const children = getChildren(category.id);
  const basePath = `/c${category.path}`;

  return (
    <div className="container-page py-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-4">
        <ol className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm">
          <li>
            <Link href="/" className="hover:text-foreground transition-colors">
              {t("nav.home")}
            </Link>
          </li>
          {trail.map((node, index) => {
            const isLast = index === trail.length - 1;
            return (
              <li key={node.id} className="flex items-center gap-1.5">
                <span aria-hidden className="opacity-40">
                  /
                </span>
                {isLast ? (
                  <span className="text-foreground font-medium">
                    {pickLocale(node.name, typedLocale)}
                  </span>
                ) : (
                  <Link
                    href={`/c${node.path}`}
                    className="hover:text-foreground transition-colors"
                  >
                    {pickLocale(node.name, typedLocale)}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <header className="mb-6">
        <h1 className="text-display text-2xl sm:text-3xl">
          {pickLocale(category.name, typedLocale)}
        </h1>
        {category.description ? (
          <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-relaxed">
            {pickLocale(category.description, typedLocale)}
          </p>
        ) : null}
      </header>

      {/* Subcategory chips */}
      {children.length ? (
        <section aria-label={t("catalog.subcategories")} className="mb-6">
          <ul className="scroll-x flex gap-2 pb-1">
            {children.map((child) => (
              <li key={child.id} className="shrink-0">
                <Link
                  href={`/c${child.path}`}
                  className="bg-card hover:border-primary/60 hover:text-primary focus-visible:ring-ring inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  {pickLocale(child.name, typedLocale)}
                  <span className="text-data text-muted-foreground text-xs">
                    {countProductsInCategory(child.slug)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        {/* Desktop filter rail */}
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
          {/* Toolbar */}
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
    </div>
  );
}
