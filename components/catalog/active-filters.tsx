"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
import { formatPriceText, pickLocale } from "@/lib/localized";
import { hasActiveFilters, mutate, queryToHref } from "@/lib/queries/search-params";
import type { Facets, Locale, ProductQuery } from "@/lib/types";

type Chip = {
  id: string;
  label: string;
  next: ProductQuery;
};

export function ActiveFilters({
  facets,
  query,
  basePath,
  locale,
}: {
  facets: Facets;
  query: ProductQuery;
  basePath: string;
  locale: Locale;
}) {
  const t = useTranslations("catalog");
  const router = useRouter();

  if (!hasActiveFilters(query)) return null;

  const chips: Chip[] = [];

  for (const slug of query.brands) {
    const brand = facets.brands.find((b) => b.slug === slug);
    chips.push({
      id: `brand-${slug}`,
      label: brand?.name ?? slug,
      next: mutate.toggleBrand(query, slug),
    });
  }

  if (query.priceMin !== undefined || query.priceMax !== undefined) {
    const from = query.priceMin ?? facets.price.min;
    const to = query.priceMax ?? facets.price.max;
    chips.push({
      id: "price",
      label: `${t("price")}: ${formatPriceText(from, locale)} – ${formatPriceText(to, locale)}`,
      next: mutate.setPrice(query, undefined, undefined),
    });
  }

  if (query.inStockOnly) {
    chips.push({
      id: "in-stock",
      label: t("inStockOnly"),
      next: mutate.setInStockOnly(query, false),
    });
  }

  for (const [key, constraint] of Object.entries(query.specs)) {
    const facet = facets.specs.find((f) => f.key === key);
    const facetLabel = facet ? pickLocale(facet.label, locale) : key;

    if (constraint.values?.length) {
      for (const value of constraint.values) {
        const bucket = facet?.buckets?.find((b) => b.value === value);
        chips.push({
          id: `spec-${key}-${value}`,
          label: `${facetLabel}: ${bucket ? pickLocale(bucket.label, locale) : value}`,
          next: mutate.toggleSpecValue(query, key, value),
        });
      }
    } else if (constraint.bool !== undefined) {
      chips.push({
        id: `spec-${key}`,
        label: facetLabel,
        next: mutate.setSpecBool(query, key, undefined),
      });
    } else {
      const unit = facet?.unit ? ` ${facet.unit}` : "";
      const from = constraint.min ?? facet?.min ?? "";
      const to = constraint.max ?? facet?.max ?? "";
      chips.push({
        id: `spec-${key}`,
        label: `${facetLabel}: ${from}–${to}${unit}`,
        next: mutate.setSpecRange(query, key, undefined, undefined),
      });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
        {t("activeFilters")}
      </span>

      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={() => router.push(queryToHref(basePath, chip.next))}
          className="bg-secondary text-secondary-foreground hover:bg-secondary/70 focus-visible:ring-ring inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          {chip.label}
          <X aria-hidden className="size-3.5 opacity-60" />
          <span className="sr-only">{t("clear")}</span>
        </button>
      ))}

      <button
        type="button"
        onClick={() => router.push(queryToHref(basePath, mutate.clearFilters(query)))}
        className="text-primary h-7 text-xs font-semibold hover:underline"
      >
        {t("clearAll")}
      </button>
    </div>
  );
}
