import { BadgeCheck, PackageSearch, ShieldCheck, Wrench } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Image from "next/image";

import { PriceBlock } from "@/components/catalog/price-block";
import { ProductGrid } from "@/components/catalog/product-grid";
import { SpecStrip } from "@/components/catalog/spec-strip";
import { HeroCarousel } from "@/components/home/hero-carousel";
import { BrandLogo } from "@/components/layout/brand-logo";
import { CategoryIcon } from "@/components/layout/category-icon";
import { SectionHeading } from "@/components/layout/section-heading";
import { Link } from "@/i18n/navigation";
import { pickLocale } from "@/lib/localized";
import { getAllBrands } from "@/lib/queries/brands";
import { getRootCategories, getSpecSchemaLookup } from "@/lib/queries/categories";
import {
  countProductsPerCategory,
  getFeaturedProducts,
  getSaleProducts,
} from "@/lib/queries/products";
import { getHeroSlides } from "@/lib/queries/slides";
import { getCardSpecs } from "@/lib/specs";
import type { Locale } from "@/lib/types";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations();
  const typedLocale = locale as Locale;
  const specLabels = { yes: t("common.yes"), no: t("common.no") };

  // Independent reads, so they overlap rather than queue.
  const [roots, featured, onSale, brands, specSchema, counts, slides] = await Promise.all([
    getRootCategories(),
    getFeaturedProducts(8),
    getSaleProducts(4),
    getAllBrands(),
    getSpecSchemaLookup(),
    countProductsPerCategory(),
    getHeroSlides(),
  ]);
  const hero = featured[0];
  const heroSpecs = hero ? getCardSpecs(hero, typedLocale, specLabels, specSchema) : [];

  const benefits = [
    { icon: Wrench, title: t("home.benefitDeliveryTitle"), text: t("home.benefitDeliveryText") },
    { icon: ShieldCheck, title: t("home.benefitWarrantyTitle"), text: t("home.benefitWarrantyText") },
    { icon: BadgeCheck, title: t("home.benefitOriginalTitle"), text: t("home.benefitOriginalText") },
    { icon: PackageSearch, title: t("home.benefitSupportTitle"), text: t("home.benefitSupportText") },
  ];

  return (
    <>
      {slides.length ? (
        <>
          {/* The banner's headline is pixels inside the artwork, invisible to a
              screen reader or a crawler, so the page still needs a real h1 —
              visually hidden, since the visual heading is the carousel itself. */}
          <h1 className="sr-only">{t("home.heroTitle")}</h1>
          <HeroCarousel slides={slides} locale={typedLocale} />
        </>
      ) : (
        /* Cover. The supplied brand artwork leads the page, on the white it was
           drawn for, and the section closes on a yellow rule sheared to the same
           oblique angle as the mark's own planes. The right-hand card is a real
           product with its spec strip, so the fold still shows what the
           catalogue is for. */
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

            {hero ? (
              <div className="bg-card text-card-foreground rounded-xl p-5 shadow-xl">
                <div className="bg-secondary/40 relative aspect-[4/3] overflow-hidden rounded-lg">
                  <Image
                    src={hero.images[0].url}
                    alt={pickLocale(hero.images[0].alt, typedLocale)}
                    fill
                    sizes="(min-width: 1024px) 40vw, 90vw"
                    priority
                    className="object-contain p-4"
                  />
                </div>
                <div className="mt-4 flex flex-col gap-2.5">
                  <p className="text-sm font-semibold">
                    {pickLocale(hero.name, typedLocale)}
                  </p>
                  <SpecStrip specs={heroSpecs} />
                  <div className="flex items-end justify-between gap-3">
                    <PriceBlock
                      price={hero.price}
                      salePrice={hero.salePrice}
                      locale={typedLocale}
                    />
                    <Link
                      href={`/p/${hero.slug}`}
                      className="text-primary text-sm font-semibold hover:underline"
                    >
                      {t("common.viewAll")} →
                    </Link>
                  </div>
                </div>
              </div>
            ) : null}
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
