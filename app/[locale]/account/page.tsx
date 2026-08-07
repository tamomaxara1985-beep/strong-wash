import { Mail, Phone, Building2, FileText } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { ProductGrid } from "@/components/catalog/product-grid";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { getSession } from "@/lib/auth/session";
import { pickLocale } from "@/lib/localized";
import { getQuoteRequests, getSavedProducts } from "@/lib/queries/account";
import { formatBytes } from "@/lib/uploads";
import type { Locale } from "@/lib/types";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/account">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

const STATUS_KEY = {
  new: "quoteStatusNew",
  contacted: "quoteStatusContacted",
  closed: "quoteStatusClosed",
} as const;

export default async function AccountPage({ params }: PageProps<"/[locale]/account">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const typedLocale = locale as Locale;

  /**
   * The proxy also gates this path, but middleware is routing, not authorisation:
   * it can be bypassed by anything that reaches the handler another way, and it
   * cannot tell a valid-looking cookie from a live account. The page re-checks.
   */
  const session = await getSession();
  if (!session) redirect(`/${locale}/sign-in`);

  const t = await getTranslations();
  const [saved, quotes] = await Promise.all([
    getSavedProducts(session.userId),
    getQuoteRequests(session.userId),
  ]);

  const dateFormat = new Intl.DateTimeFormat(
    typedLocale === "ka" ? "ka-GE" : typedLocale === "ru" ? "ru-RU" : "en-US",
    { dateStyle: "medium" },
  );

  return (
    <div className="container-page py-8">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-display text-2xl sm:text-3xl">{t("account.title")}</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {t("account.greeting", { name: session.name || session.email })}
          </p>
        </div>
        <SignOutButton />
      </header>

      <section className="bg-card mb-10 rounded-lg border p-5">
        <h2 className="text-sm font-semibold">{t("account.profile")}</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <div className="flex items-center gap-2">
            <Mail aria-hidden className="text-muted-foreground size-4" />
            <dd>{session.email}</dd>
          </div>
          <div className="flex items-center gap-2">
            <Phone aria-hidden className="text-muted-foreground size-4" />
            <dd className="text-data">{session.role === "admin" ? "admin" : "—"}</dd>
          </div>
          <div className="flex items-center gap-2">
            <Building2 aria-hidden className="text-muted-foreground size-4" />
            <dd>{session.name || "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="mb-12">
        <h2 className="text-display mb-4 text-lg">{t("account.savedProducts")}</h2>
        {saved.length ? (
          <ProductGrid products={saved} locale={typedLocale} />
        ) : (
          <p className="bg-card text-muted-foreground rounded-lg border px-6 py-10 text-center text-sm">
            {t("account.savedEmpty")}
          </p>
        )}
      </section>

      <section>
        <h2 className="text-display mb-4 text-lg">{t("account.quotes")}</h2>
        {quotes.length ? (
          <ul className="flex flex-col gap-3">
            {quotes.map((quote) => (
              <li key={quote.id} className="bg-card rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {quote.product ? (
                    <Link
                      href={`/p/${quote.product.slug}`}
                      className="text-sm font-semibold hover:underline"
                    >
                      {pickLocale(quote.product.name, typedLocale)}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                  <div className="flex items-center gap-3">
                    <span className="text-data text-muted-foreground text-xs">
                      {t("account.requestedOn", {
                        date: dateFormat.format(new Date(quote.createdAt)),
                      })}
                    </span>
                    <Badge variant="secondary">{t(`account.${STATUS_KEY[quote.status]}`)}</Badge>
                  </div>
                </div>
                {quote.message ? (
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                    {quote.message}
                  </p>
                ) : null}

                {quote.attachments.length ? (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {quote.attachments.map((file) => (
                      <li key={file.url}>
                        {/* Opens on Cloudinary. `noopener` because these are
                            third-party URLs, and `download` would need a
                            same-origin proxy to work cross-domain. */}
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`${file.originalName} · ${formatBytes(file.bytes)}`}
                          className="hover:border-primary/60 focus-visible:ring-ring flex items-center gap-2 rounded-md border p-1.5 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                        >
                          {file.isImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={file.url}
                              alt={file.originalName}
                              className="size-12 rounded object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <span className="bg-secondary grid size-12 place-items-center rounded">
                              <FileText aria-hidden className="text-muted-foreground size-5" />
                            </span>
                          )}
                          <span className="max-w-32 truncate pr-1 text-xs">
                            {file.originalName}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="bg-card text-muted-foreground rounded-lg border px-6 py-10 text-center text-sm">
            {t("account.quotesEmpty")}
          </p>
        )}
      </section>
    </div>
  );
}
