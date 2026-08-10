import { BadgeCheck, PackageSearch, ShieldCheck, Wrench } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ProductGrid } from "@/components/catalog/product-grid";
import { HeroCarousel } from "@/components/home/hero-carousel";
import { BrandLogo } from "@/components/layout/brand-logo";
import { CategoryIcon } from "@/components/layout/category-icon";
import { SectionHeading } from "@/components/layout/section-heading";
import { Link } from "@/i18n/navigation";
import { pickLocale } from "@/lib/localized";
import { getAllBrands } from "@/lib/queries/brands";
import { getRootCategories } from "@/lib/queries/categories";
import {
  countProductsPerCategory,
  getFeaturedProducts,
  getSaleProducts,
} from "@/lib/queries/products";
import { getHeroSlides } from "@/lib/queries/slides";
import type { Locale } from "@/lib/types";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations();
  const typedLocale = locale as Locale;

  // Independent reads, so they overlap rather than queue.
  const [roots, featured, onSale, brands, counts, slides] = await Promise.all([
    getRootCategories(),
    getFeaturedProducts(8),
    getSaleProducts(4),
    getAllBrands(),
    countProductsPerCategory(),
    getHeroSlides(),
  ]);

  const benefits = [
    { icon: Wrench, title: t("home.benefitDeliveryTitle"), text: t("home.benefitDeliveryText") },
    { icon: ShieldCheck, title: t("home.benefitWarrantyTitle"), text: t("home.benefitWarrantyText") },
    { icon: BadgeCheck, title: t("home.benefitOriginalTitle"), text: t("home.benefitOriginalText") },
    { icon: PackageSearch, title: t("home.benefitSupportTitle"), text: t("home.benefitSupportText") },
  ];

  return (
    <>
      {slides.length ? (
        <HeroCarousel slides={slides} locale={typedLocale} />
      ) : (
        // Cover. The supplied brand artwork leads the page, on the white it was
        // drawn for, and the section closes on a yellow rule sheared to the same
        // oblique angle as the mark's own planes.
        <section className="bg-card relative overflow-hidden">
          <div className="container-page relative grid items-center gap-10 py-12 lg:grid-cols-[1.1fr_1fr] lg:py-16">
            <div>
              <BrandLogo
                variant="lockup"
                alt={t("common.brand")}
                priority
                className="h-16 sm:h-20"
              />
              <h1 className="text-display mt-7 text-4xl sm:text-5xl lg:text-6xl">
                {t("home.heroTitle")}
              </h1>
              <p className="text-muted-foreground mt-5 max-w-xl text-base leading-relaxed sm:text-lg">
                {t("home.heroSubtitle")}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/c/automatic-systems"
                  className="bg-brand-black focus-visible:ring-ring inline-flex h-11 items-center rounded-md px-5 text-sm font-semibold text-white transition-colors hover:bg-black/85 focus-visible:ring-2 focus-visible:outline-none"
                >
                  {t("home.heroCta")}
                </Link>
                <Link
                  href="/search?sort=price_asc"
                  className="border-foreground/20 hover:bg-secondary focus-visible:ring-ring inline-flex h-11 items-center rounded-md border px-5 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  {t("home.heroSecondaryCta")}
                </Link>
              </div>
            </div>
          </div>
          <div aria-hidden className="oblique-rule" />
        </section>
      )}

      {/* Categories */}
      <section className="container-page py-12">
        <SectionHeading title={t("home.shopByCategory")} />
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {roots.map((category) => (
            <li key={category.id}>
              <Link
                href={`/c/${category.slug}`}
                className="bg-card hover:border-primary/60 focus-visible:ring-ring group flex h-full flex-col gap-3 rounded-lg border p-4 transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                <span className="bg-secondary text-primary grid size-11 place-items-center rounded-md">
                  <CategoryIcon icon={category.icon} className="size-5" />
                </span>
                <span className="text-sm font-semibold leading-snug">
                  {pickLocale(category.name, typedLocale)}
                </span>
                <span className="text-data text-muted-foreground mt-auto text-xs">
                  {counts.get(category.id) ?? 0} {t("catalog.products")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Featured */}
      <section className="container-page py-4">
        <SectionHeading
          title={t("home.featured")}
          href="/search"
          linkLabel={t("common.viewAll")}
        />
        <ProductGrid products={featured} locale={typedLocale} />
      </section>

      {/* On sale */}
      {onSale.length ? (
        <section className="container-page py-12">
          <SectionHeading
            title={t("home.onSale")}
            href="/search?sort=price_asc"
            linkLabel={t("common.viewAll")}
          />
          <ProductGrid products={onSale} locale={typedLocale} />
        </section>
      ) : null}

      {/* Brands */}
      <section className="container-page py-4">
        <SectionHeading title={t("home.brands")} />
        <ul className="flex flex-wrap gap-2">
          {brands.map((brand) => (
            <li key={brand.id}>
              <Link
                href={`/search?brand=${brand.slug}`}
                className="bg-card hover:border-primary/60 hover:text-primary focus-visible:ring-ring inline-flex h-10 items-center rounded-md border px-4 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                {brand.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Benefits */}
      <section className="container-page py-12">
        <SectionHeading title={t("home.benefitsTitle")} />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map(({ icon: Icon, title, text }) => (
            <li key={title} className="bg-card flex flex-col gap-2 rounded-lg border p-5">
              <Icon aria-hidden className="text-primary size-6" />
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-muted-foreground text-sm leading-relaxed">{text}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
