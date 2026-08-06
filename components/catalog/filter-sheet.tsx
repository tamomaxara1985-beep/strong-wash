"use client";

import { SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FilterControls } from "@/components/catalog/filter-controls";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { Facets, Locale, ProductQuery } from "@/lib/types";

/** Mobile entry point for the same controls the desktop rail renders. */
export function FilterSheet({
  facets,
  query,
  basePath,
  locale,
  total,
}: {
  facets: Facets;
  query: ProductQuery;
  basePath: string;
  locale: Locale;
  total: number;
}) {
  const t = useTranslations("catalog");
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="bg-card hover:border-primary/60 focus-visible:ring-ring inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none lg:hidden">
        <SlidersHorizontal aria-hidden className="size-4" />
        {t("filters")}
      </SheetTrigger>

      <SheetContent side="left" className="flex w-[min(22rem,92vw)] flex-col p-0">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="text-base">{t("filters")}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          <FilterControls
            facets={facets}
            query={query}
            basePath={basePath}
            locale={locale}
            idScope="sheet"
            onNavigate={() => setOpen(false)}
          />
        </div>

        <div className="border-t p-4">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex h-11 w-full items-center justify-center rounded-md text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            {t("showResults")} ({total})
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
