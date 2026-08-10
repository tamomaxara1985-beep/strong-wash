import { MapPin, Phone } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { pickLocale } from "@/lib/localized";
import type { Locale, StoreLocation } from "@/lib/types";

/**
 * Up to three branches in full, then a link.
 *
 * Three because that is how many branches there are: listing them all keeps every
 * number one glance away, and the link only appears once the column would
 * genuinely crowd.
 */
const FOOTER_LIMIT = 3;

export async function FooterLocations({
  locations,
  locale,
}: {
  locations: StoreLocation[];
  locale: Locale;
}) {
  const t = await getTranslations();
  const shown = locations.slice(0, FOOTER_LIMIT);
  const hasMore = locations.length > FOOTER_LIMIT;

  return (
    <ul className="mt-3 flex flex-col gap-4 text-sm">
      {shown.map((location) => (
        <li key={location.id} className="flex flex-col gap-1.5">
          {locations.length > 1 ? (
            <span className="text-white font-semibold">{pickLocale(location.name, locale)}</span>
          ) : null}
          <a
            href={`tel:${location.phone.replace(/\s/g, "")}`}
            className="text-data hover:text-white inline-flex items-center gap-2 font-semibold transition-colors"
          >
            <Phone aria-hidden className="size-4 shrink-0" />
            {location.phone}
          </a>
          <span className="inline-flex items-start gap-2">
            <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
            {pickLocale(location.address, locale)}
          </span>
        </li>
      ))}

      {hasMore ? (
        <li>
          <Link href="/locations" className="hover:text-white font-semibold transition-colors">
            {t("footer.allLocations")} →
          </Link>
        </li>
      ) : null}
    </ul>
  );
}
