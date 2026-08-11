import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { mapLink } from "@/lib/locations/map-link";
import { pickLocale } from "@/lib/localized";
import type { Locale, StoreLocation } from "@/lib/types";

/**
 * The primary branch's details, beside the form.
 *
 * It takes the branch as a prop rather than reading it: the page already needs
 * `getPrimaryLocation()` for its metadata, and two reads of the same cached
 * query in one render is a fact worth not relying on.
 */
export async function ContactDetails({
  location,
  locale,
}: {
  location: StoreLocation;
  locale: Locale;
}) {
  const t = await getTranslations("contact");
  const address = pickLocale(location.address, locale);
  const mapHref = mapLink(address, location.mapUrl);

  return (
    <div className="bg-card flex flex-col gap-3 rounded-xl border p-5">
      <h2 className="text-display text-lg">{pickLocale(location.name, locale)}</h2>

      <a
        href={`tel:${location.phone.replace(/\s/g, "")}`}
        className="text-data hover:text-primary inline-flex items-center gap-2 text-sm font-semibold transition-colors"
      >
        <Phone aria-hidden className="size-4 shrink-0" />
        {location.phone}
      </a>

      {location.phone2 ? (
        <a
          href={`tel:${location.phone2.replace(/\s/g, "")}`}
          className="text-data hover:text-primary inline-flex items-center gap-2 text-sm font-semibold transition-colors"
        >
          <Phone aria-hidden className="size-4 shrink-0" />
          {location.phone2}
        </a>
      ) : null}

      {location.email ? (
        <a
          href={`mailto:${location.email}`}
          className="hover:text-primary inline-flex items-center gap-2 text-sm transition-colors"
        >
          <Mail aria-hidden className="size-4 shrink-0" />
          {location.email}
        </a>
      ) : null}

      {mapHref ? (
        <a
          href={mapHref}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-primary inline-flex items-start gap-2 text-sm transition-colors"
        >
          <MapPin aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          {address}
        </a>
      ) : (
        <p className="inline-flex items-start gap-2 text-sm">
          <MapPin aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          {address}
        </p>
      )}

      <p className="text-muted-foreground inline-flex items-start gap-2 text-sm">
        <Clock aria-hidden className="mt-0.5 size-4 shrink-0" />
        {pickLocale(location.workHours, locale)}
      </p>

      <Link
        href="/locations"
        className="hover:text-primary mt-1 text-sm font-semibold transition-colors"
      >
        {t("allLocations")} →
      </Link>
    </div>
  );
}
