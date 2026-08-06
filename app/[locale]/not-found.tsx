import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("notFound");

  return (
    <div className="container-page flex flex-col items-center py-24 text-center">
      <p className="text-data text-primary text-sm font-bold">404</p>
      <h1 className="text-display mt-2 text-3xl">{t("title")}</h1>
      <p className="text-muted-foreground mt-3 max-w-md text-sm">{t("text")}</p>
      <Link
        href="/"
        className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring mt-8 inline-flex h-11 items-center rounded-md px-5 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        {t("cta")}
      </Link>
    </div>
  );
}
