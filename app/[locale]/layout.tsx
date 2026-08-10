import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { JetBrains_Mono, Noto_Sans_Georgian } from "next/font/google";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { SettingsStyle } from "@/components/layout/settings-style";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { routing } from "@/i18n/routing";
import { getLocations } from "@/lib/queries/locations";
import { getSiteSettings } from "@/lib/queries/settings";
import { fontClassNames } from "@/lib/settings/fonts";
import type { Locale } from "@/lib/types";

import "../globals.css";

// Manrope has no Mkhedruli coverage, so Georgian glyphs fall through to this
// face via the font stack in globals.css rather than a locale switch.
const notoGeorgian = Noto_Sans_Georgian({
  variable: "--font-noto-georgian",
  subsets: ["georgian"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

/**
 * Every route under this layout is rendered per request regardless: the header
 * reads the session cookie, which opts the whole subtree out of static
 * rendering. Declaring it removes a build-time prerender pass that could only
 * ever fail — it executed each page once against the database, so a build
 * container without network access to Atlas took the whole deploy down with it
 * rather than producing a site that renders on demand.
 *
 * This is not a permanent posture. Phase 5 of plan.md wants ISR on category and
 * product pages, which needs the account chip moved into a client component that
 * calls `/api/auth/me` — at that point this line comes out and the pages become
 * cacheable again.
 */
export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Absolute base for the canonical URL, the hreflang alternates and the OG tags.
 *
 * Every `alternates` entry below is a relative path, and Next resolves those
 * against `metadataBase`. Unset, it falls back to `http://localhost:3000`, which
 * means a production deploy advertises localhost canonicals to crawlers.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` is injected by the platform, so preview
 * deployments get the right host without configuring anything; the explicit
 * variable still wins for a custom domain.
 */
function siteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return new URL(explicit);

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return new URL(`https://${vercel}`);

  return new URL("http://localhost:3000");
}

export async function generateMetadata({
  params,
}: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "common" });

  return {
    metadataBase: siteUrl(),
    title: {
      default: `${t("brand")} — ${t("tagline")}`,
      template: `%s | ${t("brand")}`,
    },
    description: t("tagline"),
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, `/${l}`]),
      ),
    },
    openGraph: {
      title: `${t("brand")} — ${t("tagline")}`,
      description: t("tagline"),
      locale,
      type: "website",
      images: [{ url: "/brand/og-cover.png", width: 1200, height: 630 }],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Opts this layout's subtree into static rendering for the resolved locale.
  setRequestLocale(locale);

  // Never throws: on any failure it returns the defaults, because an error here
  // would take down every page rather than one component.
  const [settings, locations] = await Promise.all([getSiteSettings(), getLocations()]);

  return (
    <html
      lang={locale}
      className={`${fontClassNames()} ${notoGeorgian.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <SettingsStyle settings={settings} />
      </head>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <SiteHeader locale={locale as Locale} settings={settings} primary={locations[0]} />
          <main className="flex-1">{children}</main>
          <SiteFooter locale={locale as Locale} settings={settings} locations={locations} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
