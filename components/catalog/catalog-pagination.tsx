import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { mutate, queryToHref } from "@/lib/queries/search-params";
import type { ProductQuery } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Pagination is real links rather than infinite scroll: every page of a
 * category has to be crawlable and linkable.
 */
export async function CatalogPagination({
  query,
  basePath,
  page,
  totalPages,
}: {
  query: ProductQuery;
  basePath: string;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const t = await getTranslations("catalog");

  const windowSize = 2;
  const numbers: (number | "gap")[] = [];
  for (let n = 1; n <= totalPages; n += 1) {
    const nearCurrent = Math.abs(n - page) <= windowSize;
    const isEdge = n === 1 || n === totalPages;
    if (nearCurrent || isEdge) {
      numbers.push(n);
    } else if (numbers[numbers.length - 1] !== "gap") {
      numbers.push("gap");
    }
  }

  const linkClass =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

  return (
    <nav aria-label={t("page")} className="mt-8 flex justify-center">
      <ul className="flex flex-wrap items-center gap-1.5">
        <li>
          {page > 1 ? (
            <Link
              href={queryToHref(basePath, mutate.setPage(query, page - 1))}
              rel="prev"
              className={cn(linkClass, "bg-card hover:border-primary/60")}
            >
              {t("previous")}
            </Link>
          ) : (
            <span className={cn(linkClass, "text-muted-foreground opacity-50")}>
              {t("previous")}
            </span>
          )}
        </li>

        {numbers.map((n, index) =>
          n === "gap" ? (
            <li
              key={`gap-${index}`}
              aria-hidden
              className="text-muted-foreground px-1 text-sm"
            >
              …
            </li>
          ) : (
            <li key={n}>
              <Link
                href={queryToHref(basePath, mutate.setPage(query, n))}
                aria-current={n === page ? "page" : undefined}
                className={cn(
                  linkClass,
                  "text-data",
                  n === page
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card hover:border-primary/60",
                )}
              >
                {n}
              </Link>
            </li>
          ),
        )}

        <li>
          {page < totalPages ? (
            <Link
              href={queryToHref(basePath, mutate.setPage(query, page + 1))}
              rel="next"
              className={cn(linkClass, "bg-card hover:border-primary/60")}
            >
              {t("next")}
            </Link>
          ) : (
            <span className={cn(linkClass, "text-muted-foreground opacity-50")}>
              {t("next")}
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}
