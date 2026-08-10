import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { pickLocale } from "@/lib/localized";
import { getLocations } from "@/lib/queries/locations";
import type { Locale } from "@/lib/types";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/locations">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "locations" });
  return { title: t("title"), description: t("intro") };
}

export default async function LocationsPage({ params }: PageProps<"/[locale]/locations">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations();
  const typedLocale = locale as Locale;
  const locations = await getLocations();

  return (
    <div className="container-page py-12">
      <div className="mb-5 flex items-end justify-between gap-4">
        <h1 className="text-display text-xl sm:text-2xl">{t("locations.title")}</h1>
      </div>
      <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">
        {t("locations.intro")}
      </p>

      <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {locations.map((location) => (
          <li key={location.id} className="bg-card flex flex-col gap-3 rounded-xl border p-5">
            <h3 className="text-display text-lg">{pickLocale(location.name, typedLocale)}</h3>

            <p className="inline-flex items-start gap-2 text-sm">
              <MapPin aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              {pickLocale(location.address, typedLocale)}
            </p>

            <p className="text-muted-foreground inline-flex items-start gap-2 text-sm">
              <Clock aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="sr-only">{t("locations.hours")}: </span>
                {pickLocale(location.workHours, typedLocale)}
              </span>
            </p>

            <a
              href={`tel:${location.phone.replace(/\s/g, "")}`}
              className="text-data hover:text-primary inline-flex items-center gap-2 text-sm font-semibold transition-colors"
            >
              <Phone aria-hidden className="size-4 shrink-0" />
              {location.phone}
            </a>

            {location.email ? (
              <a
                href={`mailto:${location.email}`}
                className="hover:text-primary inline-flex items-center gap-2 text-sm transition-colors"
              >
                <Mail aria-hidden className="size-4 shrink-0" />
                {location.email}
              </a>
            ) : null}

            {location.mapUrl ? (
              <a
                href={location.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="border-foreground/20 hover:bg-secondary mt-1 inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-semibold transition-colors"
              >
                {t("locations.directions")} ↗
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
