import { getTranslations } from "next-intl/server";

import { BrandLogo } from "@/components/layout/brand-logo";
import { FooterLocations } from "@/components/layout/footer-locations";
import { Link } from "@/i18n/navigation";
import { pickLocale } from "@/lib/localized";
import { getRootCategories } from "@/lib/queries/categories";
import type { Locale, StoreLocation } from "@/lib/types";

export async function SiteFooter({
  locale,
  locations,
}: {
  locale: Locale;
  locations: StoreLocation[];
}) {
  const t = await getTranslations();
  const roots = await getRootCategories();
  const year = 2026;

  return (
    <footer className="bg-brand-black mt-16 text-white/75">
      {/* Yellow rule sheared to the logo's own projection angle. */}
      <div className="oblique-rule" />
      <div className="container-page grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <BrandLogo variant="lockup" tone="inverse" alt={t("common.brand")} className="h-11" />
          <p className="mt-4 text-sm leading-relaxed">{t("footer.aboutText")}</p>
        </div>

        <nav aria-labelledby="footer-categories">
          <p
            id="footer-categories"
            className="text-white text-sm font-semibold"
          >
            {t("footer.categoriesTitle")}
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {roots.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/c/${category.slug}`}
                  className="hover:text-white transition-colors"
                >
                  {pickLocale(category.name, locale)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-labelledby="footer-help">
          <p id="footer-help" className="text-white text-sm font-semibold">
            {t("footer.helpTitle")}
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            <li>{t("footer.delivery")}</li>
            <li>{t("footer.warranty")}</li>
            <li>{t("footer.returns")}</li>
            <li>{t("footer.faq")}</li>
          </ul>
        </nav>

        <div>
          <p className="text-white text-sm font-semibold">
            {t("footer.contactTitle")}
          </p>
          <FooterLocations locations={locations} locale={locale} />
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-page flex flex-col gap-2 py-5 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {t("common.brand")}. {t("footer.rights")}
          </p>
          {/* Phase 1 is a catalogue: no cart, so no payment marks to show yet. */}
          <p className="text-white/50">{t("product.contactHint")}</p>
        </div>
      </div>
    </footer>
  );
}
