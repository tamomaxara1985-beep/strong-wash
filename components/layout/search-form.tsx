"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * `defaultValue` is a prop rather than a `useSearchParams()` read: this form
 * renders inside the root layout, and reading search params there would opt the
 * whole layout out of static rendering. Pages that know the query (the search
 * page) pass it down.
 */
export function SearchForm({
  className,
  defaultValue = "",
  autoFocus = false,
  onSubmitted,
}: {
  className?: string;
  defaultValue?: string;
  autoFocus?: boolean;
  onSubmitted?: () => void;
}) {
  const t = useTranslations("common");
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  // The header renders this form more than once per page (desktop bar, mobile
  // row, mobile nav sheet), so the input id has to be generated.
  const inputId = useId();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = value.trim();
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
    onSubmitted?.();
  }

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      className={cn("relative flex w-full items-center", className)}
    >
      <label htmlFor={inputId} className="sr-only">
        {t("search")}
      </label>
      <Search
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute left-3 size-4"
      />
      <input
        id={inputId}
        type="search"
        name="q"
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t("searchPlaceholder")}
        className="border-input bg-background placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/25 h-10 w-full rounded-md border pl-9 pr-24 text-sm transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:outline-none"
      />
      <button
        type="submit"
        className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring absolute right-1 inline-flex h-8 items-center rounded-sm px-3 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        {t("search")}
      </button>
    </form>
  );
}
