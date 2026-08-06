import { defineRouting } from "next-intl/routing";

import { DEFAULT_LOCALE, LOCALES } from "@/lib/types";

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  // Georgian is the default but still carries a /ka prefix, so every URL is
  // unambiguous and hreflang alternates stay symmetrical for SEO.
  localePrefix: "always",
});
