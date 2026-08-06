"use client";

import { useTranslations } from "next-intl";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
import { mutate, queryToHref } from "@/lib/queries/search-params";
import { SORT_OPTIONS, type ProductQuery, type SortOption } from "@/lib/types";

const LABEL_KEYS: Record<SortOption, string> = {
  relevance: "sortRelevance",
  price_asc: "sortPriceAsc",
  price_desc: "sortPriceDesc",
  newest: "sortNewest",
  name_asc: "sortNameAsc",
};

export function SortSelect({
  query,
  basePath,
}: {
  query: ProductQuery;
  basePath: string;
}) {
  const t = useTranslations("catalog");
  const router = useRouter();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sort-select" className="text-muted-foreground text-sm">
        {t("sort")}
      </label>
      <Select
        value={query.sort}
        onValueChange={(value) =>
          router.push(queryToHref(basePath, mutate.setSort(query, value as SortOption)))
        }
      >
        <SelectTrigger id="sort-select" className="h-9 w-[11.5rem] text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((option) => (
            <SelectItem key={option} value={option} className="text-sm">
              {t(LABEL_KEYS[option])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
