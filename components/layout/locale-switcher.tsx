"use client";

import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useTransition } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePathname, useRouter } from "@/i18n/navigation";
import { LOCALES, type Locale } from "@/lib/types";
import { cn } from "@/lib/utils";

const LABELS: Record<Locale, string> = {
  ka: "ქართული",
  en: "English",
  ru: "Русский",
};

const SHORT: Record<Locale, string> = {
  ka: "KA",
  en: "EN",
  ru: "RU",
};

export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useTranslations("common");
  const active = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const [isPending, startTransition] = useTransition();

  function select(next: Locale) {
    if (next === active) return;
    startTransition(() => {
      // `pathname` here is locale-agnostic, so any dynamic segments still in
      // the current route have to be handed back for the rewrite.
      router.replace(
        // @ts-expect-error -- pathname/params are correlated at runtime but the
        // typed-routes helper cannot prove it for an arbitrary current route.
        { pathname, params },
        { locale: next },
      );
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("language")}
        disabled={isPending}
        className={cn(
          "text-data hover:bg-secondary focus-visible:ring-ring inline-flex h-8 items-center gap-1 rounded-sm px-2 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60",
          className,
        )}
      >
        {SHORT[active]}
        <svg aria-hidden viewBox="0 0 12 12" className="size-3 opacity-60">
          <path d="M3 4.5 6 8l3-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        {LOCALES.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onSelect={() => select(locale)}
            className={cn(
              "cursor-pointer text-sm",
              locale === active && "font-semibold",
            )}
          >
            <span className="text-data text-muted-foreground mr-2 text-xs">
              {SHORT[locale]}
            </span>
            {LABELS[locale]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
