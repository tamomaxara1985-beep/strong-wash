import { MapPin, Phone } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { mapLink } from "@/lib/locations/map-link";
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
      {shown.map((location) => {
        const address = pickLocale(location.address, locale);
        const mapHref = mapLink(address, location.mapUrl);

        return (
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
          {/* Clickable for the same reason it is on /locations: the address is
              what a visitor reaches for when they want the map. */}
          {mapHref ? (
            <a
              href={mapHref}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white inline-flex items-start gap-2 transition-colors"
            >
              <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
              {address}
            </a>
          ) : (
            <span className="inline-flex items-start gap-2">
              <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
              {address}
            </span>
          )}
        </li>
        );
      })}

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
