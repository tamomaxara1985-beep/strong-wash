import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { ContactDetails } from "@/components/contact/contact-details";
import { ContactForm } from "@/components/contact/contact-form";
import { getPrimaryLocation } from "@/lib/queries/locations";
import type { Locale } from "@/lib/types";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/contact">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "contact" });
  return { title: t("title"), description: t("intro") };
}

export default async function ContactPage({ params }: PageProps<"/[locale]/contact">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("contact");
  const typedLocale = locale as Locale;
  const location = await getPrimaryLocation();

  return (
    <div className="container-page py-12">
      <h1 className="text-display text-xl sm:text-2xl">{t("title")}</h1>
      <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">{t("intro")}</p>

      {/* Details first in the markup as well as on screen: someone who only
          wants the phone number should not tab through the whole form. */}
      <div className="mt-8 grid items-start gap-6 md:grid-cols-2">
        <ContactDetails location={location} locale={typedLocale} />
        <ContactForm locale={locale} />
      </div>
    </div>
  );
}
