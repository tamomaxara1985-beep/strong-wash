"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useRouter } from "@/i18n/navigation";
import { pickLocale } from "@/lib/localized";
import { mutate, queryToHref } from "@/lib/queries/search-params";
import type { Facets, Locale, ProductQuery } from "@/lib/types";

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="py-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

export function FilterControls({
  facets,
  query,
  basePath,
  locale,
  /**
   * A page renders these controls twice — once in the desktop rail and once in
   * the mobile sheet — so every generated `id` needs a scope, or the two copies
   * collide and clicking a label focuses the wrong control.
   */
  idScope,
  onNavigate,
}: {
  facets: Facets;
  query: ProductQuery;
  basePath: string;
  locale: Locale;
  idScope: string;
  onNavigate?: () => void;
}) {
  const t = useTranslations("catalog");
  const router = useRouter();
  const [brandFilter, setBrandFilter] = useState("");

  function go(next: ProductQuery) {
    router.push(queryToHref(basePath, next));
    onNavigate?.();
  }

  const visibleBrands = facets.brands.filter((b) =>
    b.name.toLowerCase().includes(brandFilter.trim().toLowerCase()),
  );

  const priceLow = query.priceMin ?? facets.price.min;
  const priceHigh = query.priceMax ?? facets.price.max;
  const inStockId = `${idScope}-in-stock`;

  return (
    <div className="divide-y">
      {/* Price */}
      {facets.price.max > facets.price.min ? (
        <FilterGroup title={t("price")}>
          <NumericRange
            idPrefix={`${idScope}-price`}
            min={facets.price.min}
            max={facets.price.max}
            low={priceLow}
            high={priceHigh}
            minLabel={t("min")}
            maxLabel={t("max")}
            onCommit={(low, high) =>
              go(
                mutate.setPrice(
                  query,
                  low > facets.price.min ? low : undefined,
                  high < facets.price.max ? high : undefined,
                ),
              )
            }
          />
        </FilterGroup>
      ) : null}

      {/* Availability */}
      <FilterGroup title={t("availability")}>
        <div className="flex items-center gap-2.5">
          <Checkbox
            id={inStockId}
            checked={query.inStockOnly}
            onCheckedChange={(checked) =>
              go(mutate.setInStockOnly(query, checked === true))
            }
          />
          <Label htmlFor={inStockId} className="cursor-pointer text-sm font-normal">
            {t("inStockOnly")}
          </Label>
          <span className="text-data text-muted-foreground ml-auto text-xs">
            {facets.inStockCount}
          </span>
        </div>
      </FilterGroup>

      {/* Brand */}
      {facets.brands.length > 1 ? (
        <FilterGroup title={t("brand")}>
          {facets.brands.length > 8 ? (
            <Input
              type="search"
              value={brandFilter}
              onChange={(event) => setBrandFilter(event.target.value)}
              placeholder={t("searchBrand")}
              aria-label={t("searchBrand")}
              className="mb-3 h-9"
            />
          ) : null}
          <ul className="flex max-h-64 flex-col gap-2.5 overflow-y-auto pr-1">
            {visibleBrands.map((brand) => {
              const id = `${idScope}-brand-${brand.slug}`;
              return (
                <li key={brand.slug} className="flex items-center gap-2.5">
                  <Checkbox
                    id={id}
                    checked={query.brands.includes(brand.slug)}
                    onCheckedChange={() => go(mutate.toggleBrand(query, brand.slug))}
                  />
                  <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
                    {brand.name}
                  </Label>
                  <span className="text-data text-muted-foreground ml-auto text-xs">
                    {brand.count}
                  </span>
                </li>
              );
            })}
          </ul>
        </FilterGroup>
      ) : null}

      {/* Category-specific specs */}
      {facets.specs.map((facet) => {
        const label = pickLocale(facet.label, locale);

        if (facet.type === "enum" && facet.buckets?.length) {
          return (
            <FilterGroup key={facet.key} title={label}>
              <ul className="flex flex-col gap-2.5">
                {facet.buckets.map((bucket) => {
                  const id = `${idScope}-${facet.key}-${bucket.value}`;
                  const checked =
                    query.specs[facet.key]?.values?.includes(bucket.value) ?? false;
                  return (
                    <li key={bucket.value} className="flex items-center gap-2.5">
                      <Checkbox
                        id={id}
                        checked={checked}
                        onCheckedChange={() =>
                          go(mutate.toggleSpecValue(query, facet.key, bucket.value))
                        }
                      />
                      <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
                        {pickLocale(bucket.label, locale)}
                      </Label>
                      <span className="text-data text-muted-foreground ml-auto text-xs">
                        {bucket.count}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </FilterGroup>
          );
        }

        if (facet.type === "bool") {
          const id = `${idScope}-${facet.key}`;
          return (
            <FilterGroup key={facet.key} title={label}>
              <div className="flex items-center gap-2.5">
                <Checkbox
                  id={id}
                  checked={query.specs[facet.key]?.bool === true}
                  onCheckedChange={(checked) =>
                    go(
                      mutate.setSpecBool(
                        query,
                        facet.key,
                        checked === true ? true : undefined,
                      ),
                    )
                  }
                />
                <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
                  {label}
                </Label>
                <span className="text-data text-muted-foreground ml-auto text-xs">
                  {facet.trueCount}
                </span>
              </div>
            </FilterGroup>
          );
        }

        if (
          facet.type === "number" &&
          facet.min !== undefined &&
          facet.max !== undefined
        ) {
          const current = query.specs[facet.key];
          const facetMin = facet.min;
          const facetMax = facet.max;
          return (
            <FilterGroup
              key={facet.key}
              title={facet.unit ? `${label}, ${facet.unit}` : label}
            >
              <NumericRange
                idPrefix={`${idScope}-${facet.key}`}
                min={facetMin}
                max={facetMax}
                low={current?.min ?? facetMin}
                high={current?.max ?? facetMax}
                minLabel={t("min")}
                maxLabel={t("max")}
                step={facetMax - facetMin <= 10 ? 0.1 : 1}
                onCommit={(low, high) =>
                  go(
                    mutate.setSpecRange(
                      query,
                      facet.key,
                      low > facetMin ? low : undefined,
                      high < facetMax ? high : undefined,
                    ),
                  )
                }
              />
            </FilterGroup>
          );
        }

        return null;
      })}
    </div>
  );
}

/**
 * Dual-thumb range with numeric inputs. Navigation happens on commit (pointer
 * release / blur), not on every drag frame, so one filter change is one history
 * entry and one server render.
 */
function NumericRange({
  idPrefix,
  min,
  max,
  low,
  high,
  minLabel,
  maxLabel,
  step = 1,
  onCommit,
}: {
  idPrefix: string;
  min: number;
  max: number;
  low: number;
  high: number;
  minLabel: string;
  maxLabel: string;
  step?: number;
  onCommit: (low: number, high: number) => void;
}) {
  const [draft, setDraft] = useState<[number, number]>([low, high]);

  function clamp(value: number) {
    if (!Number.isFinite(value)) return min;
    return Math.min(Math.max(value, min), max);
  }

  return (
    <div className="flex flex-col gap-3">
      <Slider
        min={min}
        max={max}
        step={step}
        value={draft}
        onValueChange={(value) => setDraft([value[0], value[1]])}
        onValueCommit={(value) => onCommit(value[0], value[1])}
        aria-label={`${minLabel} – ${maxLabel}`}
      />
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Label htmlFor={`${idPrefix}-min`} className="sr-only">
            {minLabel}
          </Label>
          <Input
            id={`${idPrefix}-min`}
            type="number"
            inputMode="numeric"
            value={draft[0]}
            min={min}
            max={max}
            onChange={(event) => setDraft([Number(event.target.value), draft[1]])}
            onBlur={() => onCommit(clamp(draft[0]), clamp(draft[1]))}
            className="text-data h-9"
          />
        </div>
        <span aria-hidden className="text-muted-foreground">
          –
        </span>
        <div className="flex-1">
          <Label htmlFor={`${idPrefix}-max`} className="sr-only">
            {maxLabel}
          </Label>
          <Input
            id={`${idPrefix}-max`}
            type="number"
            inputMode="numeric"
            value={draft[1]}
            min={min}
            max={max}
            onChange={(event) => setDraft([draft[0], Number(event.target.value)])}
            onBlur={() => onCommit(clamp(draft[0]), clamp(draft[1]))}
            className="text-data h-9"
          />
        </div>
      </div>
    </div>
  );
}
