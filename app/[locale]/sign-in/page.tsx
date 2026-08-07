import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AuthDivider } from "@/components/auth/auth-divider";
import { AuthForm } from "@/components/auth/auth-form";
import { GoogleButton } from "@/components/auth/google-button";
import { Link } from "@/i18n/navigation";
import { googleErrorMessage } from "@/lib/auth/google-errors";
import { getSession } from "@/lib/auth/session";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/sign-in">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return {
    title: t("signInTitle"),
    // Auth pages have nothing to rank for and should not appear in results.
    robots: { index: false, follow: false },
  };
}

/**
 * Turns `?next=` into a destination the locale-aware router accepts.
 *
 * Only same-site absolute paths are honoured. A value like
 * `//evil.example.com` is a protocol-relative URL that the browser would treat
 * as another origin, so anything not starting with a single `/` is discarded —
 * an open redirect on a sign-in page is a phishing primitive.
 */
function safeNext(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/account";
  // The i18n router adds the locale prefix itself; leaving it in would produce
  // `/ka/ka/account`.
  const withoutLocale = raw.replace(/^\/(ka|en|ru)(?=\/|$)/, "");
  return withoutLocale || "/account";
}

export default async function SignInPage({
  params,
  searchParams,
}: PageProps<"/[locale]/sign-in">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { next, error } = await searchParams;
  const redirectTo = safeNext(typeof next === "string" ? next : undefined);

  // Already signed in: sending them to the form again is a dead end.
  if (await getSession()) redirect(`/${locale}${redirectTo}`);

  const t = await getTranslations("auth");
  // The OAuth routes redirect back here with a code rather than a JSON body,
  // because the user arrives by browser navigation.
  const oauthError = typeof error === "string" ? googleErrorMessage(error, t) : null;

  return (
    <div className="container-page py-12">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-display text-2xl">{t("signInTitle")}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{t("signInSubtitle")}</p>

        <div className="bg-card mt-6 flex flex-col gap-5 rounded-lg border p-6">
          {oauthError ? (
            <p
              role="alert"
              className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
            >
              {oauthError}
            </p>
          ) : null}

          <GoogleButton next={next && typeof next === "string" ? next : undefined} />
          <AuthDivider />
          <AuthForm mode="sign-in" redirectTo={redirectTo} />
        </div>

        <p className="text-muted-foreground mt-4 text-sm">
          {t("noAccount")}{" "}
          <Link href="/sign-up" className="text-primary font-semibold hover:underline">
            {t("signUp")}
          </Link>
        </p>
      </div>
    </div>
  );
}
