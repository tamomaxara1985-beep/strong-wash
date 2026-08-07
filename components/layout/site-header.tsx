import { Heart, MapPin, Phone, UserRound } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { BrandLogo } from "@/components/layout/brand-logo";
import {
  CatalogMenu,
  type CatalogCategory,
} from "@/components/layout/catalog-menu";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { MobileNav } from "@/components/layout/mobile-nav";
import { SearchForm } from "@/components/layout/search-form";
import { Link } from "@/i18n/navigation";
import { getSession } from "@/lib/auth/session";
import { pickLocale } from "@/lib/localized";
import { getCategoryTree } from "@/lib/queries/categories";
import { countProductsPerCategory } from "@/lib/queries/products";
import type { Locale } from "@/lib/types";

const PHONE = "+995 322 40 40 40";

export async function SiteHeader({ locale }: { locale: Locale }) {
  const t = await getTranslations();

  const [tree, counts, session] = await Promise.all([
    getCategoryTree(),
    countProductsPerCategory(),
    getSession(),
  ]);

  // One localized tree feeds both navs: the desktop flyout also needs the root
  // icon and description, which `NavCategory` does not carry.
  const navCategories: CatalogCategory[] = tree.map((root) => ({
    id: root.id,
    slug: root.slug,
    name: pickLocale(root.name, locale),
    icon: root.icon,
    description: root.description
      ? pickLocale(root.description, locale)
      : undefined,
    children: root.children.map((child) => ({
      id: child.id,
      slug: child.slug,
      name: pickLocale(child.name, locale),
      count: counts.get(child.id) ?? 0,
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
        <MobileNav categories={navCategories} phone={PHONE} signedIn={Boolean(session)} />

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

        <div className="ml-auto flex shrink-0 items-center gap-1 md:ml-0">
          {session ? (
            <>
              <Link
                href="/account"
                aria-label={t("nav.wishlist")}
                className="text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-ring hidden size-10 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none lg:inline-flex"
              >
                <Heart aria-hidden className="size-5" />
              </Link>
              <Link
                href="/account"
                className="hover:bg-secondary focus-visible:ring-ring inline-flex h-10 max-w-40 items-center gap-2 rounded-md px-2.5 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                <UserRound aria-hidden className="size-5 shrink-0" />
                {/* The first name only: a full name pushes the search bar out of
                    the row on a narrow desktop window. */}
                <span className="hidden truncate lg:inline">
                  {session.name.split(" ")[0] || t("auth.account")}
                </span>
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="hover:bg-secondary focus-visible:ring-ring inline-flex h-10 items-center gap-2 rounded-md px-2.5 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                <UserRound aria-hidden className="size-5" />
                <span className="hidden lg:inline">{t("auth.signIn")}</span>
              </Link>
              <Link
                href="/sign-up"
                className="bg-brand-black hover:bg-brand-black/85 focus-visible:ring-ring hidden h-10 items-center rounded-md px-3 text-sm font-semibold text-white transition-colors focus-visible:ring-2 focus-visible:outline-none lg:inline-flex"
              >
                {t("auth.signUp")}
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Mobile search sits on its own row so the logo keeps its space. */}
      <div className="container-page pb-3 md:hidden">
        <SearchForm />
      </div>

      {/* Catalogue bar. The flyout anchors to the container's left edge, so the
          panel lines up with page content rather than the viewport. */}
      <div className="bg-brand-black hidden lg:block">
        <div className="container-page flex items-stretch">
          <CatalogMenu categories={navCategories} />
        </div>
      </div>
    </header>
  );
}
