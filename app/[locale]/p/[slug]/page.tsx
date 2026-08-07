import { Phone, Truck } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { DiscountBadge, PriceBlock } from "@/components/catalog/price-block";
import { ProductGrid } from "@/components/catalog/product-grid";
import { SpecStrip } from "@/components/catalog/spec-strip";
import { StockBadge } from "@/components/catalog/stock-badge";
import { SectionHeading } from "@/components/layout/section-heading";
import { ProductGallery } from "@/components/product/product-gallery";
import { QuoteRequestDialog } from "@/components/product/quote-request-dialog";
import { SaveProductButton } from "@/components/product/save-product-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getSession } from "@/lib/auth/session";
import { discountPercent, pickLocale } from "@/lib/localized";
import { getSavedProductIds } from "@/lib/queries/account";
import {
  getCategoryById,
  getCategoryTrail,
  getSpecSchemaLookup,
} from "@/lib/queries/categories";
import {
  getProductBySlug,
  getRelatedProducts,
  listActiveProductSlugs,
} from "@/lib/queries/products";
import { getCardSpecs, resolveSpecs } from "@/lib/specs";
import type { Locale } from "@/lib/types";

const PHONE = "+995 322 40 40 40";

export async function generateStaticParams() {
  // See the category route: an unreachable database defers to request-time
  // rendering rather than failing the build.
  try {
    const slugs = await listActiveProductSlugs();
    return routing.locales.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/p/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return {};

  const typedLocale = locale as Locale;

  return {
    title: pickLocale(product.name, typedLocale),
    description: pickLocale(product.shortDescription, typedLocale),
    alternates: {
      canonical: `/${locale}/p/${product.slug}`,
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, `/${l}/p/${product.slug}`]),
      ),
    },
  };
}

export default async function ProductPage({ params }: PageProps<"/[locale]/p/[slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const t = await getTranslations();
  const typedLocale = locale as Locale;
  const specLabels = { yes: t("common.yes"), no: t("common.no") };

  // The brand name rides along on the product — the listing pipeline
  // denormalises it, so the detail page needs no second read.
  const brand = product.brandName
    ? { slug: product.brandSlug, name: product.brandName }
    : undefined;
  // Saved state is per-user, so it is read here rather than inside the client
  // button: the page already renders on the server and can send the answer down
  // with the first paint instead of flashing an unsaved heart.
  const session = await getSession();
  const savedIds = session ? await getSavedProductIds(session.userId) : new Set<string>();

  const category = await getCategoryById(product.category);
  const [trail, related, specSchema] = await Promise.all([
    category ? getCategoryTrail(category) : Promise.resolve([]),
    getRelatedProducts(product, 4),
    getSpecSchemaLookup(),
  ]);
  const allSpecs = resolveSpecs(product, typedLocale, specLabels, specSchema);
  const cardSpecs = getCardSpecs(product, typedLocale, specLabels, specSchema);
  const percent = discountPercent(product.price, product.salePrice);

  return (
    <div className="container-page py-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-5">
        <ol className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm">
          <li>
            <Link href="/" className="hover:text-foreground transition-colors">
              {t("nav.home")}
            </Link>
          </li>
          {trail.map((node) => (
            <li key={node.id} className="flex items-center gap-1.5">
              <span aria-hidden className="opacity-40">
                /
              </span>
              <Link
                href={`/c${node.path}`}
                className="hover:text-foreground transition-colors"
              >
                {pickLocale(node.name, typedLocale)}
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <ProductGallery
          label={t("product.gallery")}
          images={product.images.map((image) => ({
            url: image.url,
            alt: pickLocale(image.alt, typedLocale),
          }))}
        />

        <div className="flex flex-col gap-5">
          <div>
            {brand ? (
              <Link
                href={`/search?brand=${brand.slug}`}
                className="text-primary text-xs font-semibold uppercase tracking-wide hover:underline"
              >
                {brand.name}
              </Link>
            ) : null}
            <h1 className="text-display mt-1.5 text-2xl sm:text-3xl">
              {pickLocale(product.name, typedLocale)}
            </h1>
            <p className="text-data text-muted-foreground mt-2 text-xs">
              {t("product.sku")}: {product.sku}
            </p>
          </div>

          <p className="text-sm leading-relaxed">
            {pickLocale(product.shortDescription, typedLocale)}
          </p>

          {/* Key specs, same strip as the card so the vocabulary is consistent
              between browsing and deciding. */}
          {cardSpecs.length ? (
            <div>
              <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wide">
                {t("product.keySpecs")}
              </p>
              <SpecStrip specs={cardSpecs} />
            </div>
          ) : null}

          <div className="bg-card flex flex-col gap-4 rounded-lg border p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <PriceBlock
                price={product.price}
                salePrice={product.salePrice}
                locale={typedLocale}
                size="lg"
              />
              <DiscountBadge percent={percent} />
            </div>

            <StockBadge status={product.stockStatus} />

            {/* No cart in v1. The primary action is a quote request, which can
                carry photos of the site; the phone stays as the immediate
                alternative for anyone who would rather just call. */}
            <QuoteRequestDialog
              productSlug={product.slug}
              locale={typedLocale}
              defaults={
                session ? { name: session.name, email: session.email } : undefined
              }
            />
            <a
              href={`tel:${PHONE.replace(/\s/g, "")}`}
              className="hover:bg-secondary focus-visible:ring-ring inline-flex h-12 items-center justify-center gap-2 rounded-md border text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <Phone aria-hidden className="size-4" />
              {/* The number itself, not "Request a quote" — that label now
                  belongs to the dialog above, and two buttons reading the same
                  thing is a coin toss rather than a choice. */}
              <span className="text-data">{PHONE}</span>
            </a>
            <SaveProductButton
              productId={product.id}
              initiallySaved={savedIds.has(product.id)}
              signedIn={Boolean(session)}
            />
            <p className="text-muted-foreground text-xs leading-relaxed">
              {t("product.contactHint")}
            </p>
          </div>

          <div className="text-muted-foreground flex items-start gap-2 text-sm">
            <Truck aria-hidden className="text-primary mt-0.5 size-4 shrink-0" />
            <span>{t("product.deliveryText")}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-12">
        <Tabs defaultValue="description">
          {/* Georgian and Russian tab labels are wider than a 390px viewport, and
              an `inline-flex w-fit` list neither wraps nor scrolls — the page
              itself scrolled sideways instead. Scrolling the strip keeps the
              page fixed; `max-w-full` is what actually lets it shrink inside the
              flex parent. */}
          <TabsList className="scroll-x max-w-full justify-start">
            <TabsTrigger value="description">{t("product.description")}</TabsTrigger>
            <TabsTrigger value="specs">{t("product.specifications")}</TabsTrigger>
            <TabsTrigger value="delivery">{t("product.delivery")}</TabsTrigger>
          </TabsList>

          <TabsContent value="description" className="max-w-3xl pt-5">
            {pickLocale(product.description, typedLocale)
              .split("\n\n")
              .map((paragraph, index) => (
                <p key={index} className="mb-3 text-sm leading-relaxed">
                  {paragraph}
                </p>
              ))}
          </TabsContent>

          <TabsContent value="specs" className="pt-5">
            <div className="scroll-x max-w-3xl">
              <table className="w-full text-sm">
                <caption className="sr-only">{t("product.specifications")}</caption>
                <tbody>
                  {allSpecs.map((spec) => (
                    <tr key={spec.key} className="border-b last:border-0">
                      <th
                        scope="row"
                        className="text-muted-foreground w-1/2 py-2.5 pr-4 text-left font-normal"
                      >
                        {spec.label}
                      </th>
                      <td className="text-data py-2.5 font-medium">{spec.display}</td>
                    </tr>
                  ))}
                  <tr className="border-b last:border-0">
                    <th
                      scope="row"
                      className="text-muted-foreground py-2.5 pr-4 text-left font-normal"
                    >
                      {t("product.brand")}
                    </th>
                    <td className="py-2.5 font-medium">{brand?.name ?? "—"}</td>
                  </tr>
                  <tr>
                    <th
                      scope="row"
                      className="text-muted-foreground py-2.5 pr-4 text-left font-normal"
                    >
                      {t("product.sku")}
                    </th>
                    <td className="text-data py-2.5 font-medium">{product.sku}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="delivery" className="max-w-3xl pt-5">
            <p className="text-sm leading-relaxed">{t("product.deliveryText")}</p>
          </TabsContent>
        </Tabs>
      </div>

      {/* Related */}
      {related.length ? (
        <section className="mt-14">
          <SectionHeading
            title={t("product.related")}
            href={category ? `/c${category.path}` : undefined}
            linkLabel={t("common.viewAll")}
          />
          <ProductGrid products={related} locale={typedLocale} />
        </section>
      ) : null}

      {/* Energy class is the single most decision-relevant attribute in this
          catalogue, so it is also exposed to search engines as structured data. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: pickLocale(product.name, typedLocale),
            sku: product.sku,
            description: pickLocale(product.shortDescription, typedLocale),
            brand: brand ? { "@type": "Brand", name: brand.name } : undefined,
            offers: {
              "@type": "Offer",
              price: product.salePrice ?? product.price,
              priceCurrency: "GEL",
              availability:
                product.stockStatus === "out"
                  ? "https://schema.org/OutOfStock"
                  : product.stockStatus === "preorder"
                    ? "https://schema.org/PreOrder"
                    : "https://schema.org/InStock",
            },
          }),
        }}
      />
    </div>
  );
}
