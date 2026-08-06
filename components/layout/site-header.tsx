import { Heart, MapPin, Phone } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { BrandLogo } from "@/components/layout/brand-logo";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { MegaMenu } from "@/components/layout/mega-menu";
import { MobileNav, type NavCategory } from "@/components/layout/mobile-nav";
import { SearchForm } from "@/components/layout/search-form";
import { Link } from "@/i18n/navigation";
import { pickLocale } from "@/lib/localized";
import { getCategoryTree } from "@/lib/mock/categories";
import { countProductsInCategory } from "@/lib/queries/products";
import type { Locale } from "@/lib/types";

const PHONE = "+995 322 40 40 40";

export async function SiteHeader({ locale }: { locale: Locale }) {
  const t = await getTranslations();

  const navCategories: NavCategory[] = getCategoryTree().map((root) => ({
    id: root.id,
    slug: root.slug,
    name: pickLocale(root.name, locale),
    children: root.children.map((child) => ({
      id: child.id,
      slug: child.slug,
      name: pickLocale(child.name, locale),
      count: countProductsInCategory(child.slug),
    })),
  }));

  return (
    <header className="bg-card sticky top-0 z-50 shadow-sm">
      {/* Utility bar — black, the brand's other half. */}
      <div className="bg-brand-black hidden text-white lg:block">
        <div className="container-page flex h-9 items-center justify-between text-xs">
          <p className="text-white/65">{t("common.tagline")}</p>
          <div className="flex items-center gap-4">
            <Link
              href="/c/spare-parts"
              className="inline-flex items-center gap-1.5 text-white/80 transition-colors hover:text-white"
            >
              <MapPin aria-hidden className="size-3.5" />
              {t("nav.stores")}
            </Link>
            <a
              href={`tel:${PHONE.replace(/\s/g, "")}`}
              className="text-data inline-flex items-center gap-1.5 font-semibold text-white/90 transition-colors hover:text-white"
            >
              <Phone aria-hidden className="size-3.5" />
              {PHONE}
            </a>
            <LocaleSwitcher className="text-white hover:bg-white/10" />
          </div>
        </div>
      </div>

      {/* Main bar — white, so the two-colour logo is used exactly as supplied. */}
      <div className="container-page flex h-16 items-center gap-3">
        <MobileNav categories={navCategories} phone={PHONE} />

        <Link
          href="/"
          aria-label={t("common.brand")}
          className="focus-visible:ring-ring flex shrink-0 items-center rounded-sm focus-visible:ring-2 focus-visible:outline-none"
        >
          <BrandLogo variant="lockup" alt="" priority className="h-9 sm:h-10" />
        </Link>

        <div className="mx-auto hidden w-full max-w-2xl md:block">
          <SearchForm />
        </div>

        <Link
          href="/search"
          aria-label={t("nav.wishlist")}
          className="text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-ring ml-auto hidden size-10 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none md:ml-0 lg:inline-flex"
        >
          <Heart aria-hidden className="size-5" />
        </Link>
      </div>

      {/* Mobile search sits on its own row so the logo keeps its space. */}
      <div className="container-page pb-3 md:hidden">
        <SearchForm />
      </div>

      {/* Category bar + mega-menu. `relative` anchors the full-width panel. */}
      <div className="bg-brand-black relative">
        <div className="container-page">
          <MegaMenu locale={locale} />
        </div>
      </div>
    </header>
  );
}
