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
}: PageProps<"/[locale]/sign-up">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return {
    title: t("signUpTitle"),
    robots: { index: false, follow: false },
  };
}

export default async function SignUpPage({
  params,
  searchParams,
}: PageProps<"/[locale]/sign-up">) {
  const { locale } = await params;
  setRequestLocale(locale);

  if (await getSession()) redirect(`/${locale}/account`);

  const t = await getTranslations("auth");
  const { error } = await searchParams;
  const oauthError = typeof error === "string" ? googleErrorMessage(error, t) : null;

  return (
    <div className="container-page py-12">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-display text-2xl">{t("signUpTitle")}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{t("signUpSubtitle")}</p>

        <div className="bg-card mt-6 flex flex-col gap-5 rounded-lg border p-6">
          {oauthError ? (
            <p
              role="alert"
              className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
            >
              {oauthError}
            </p>
          ) : null}

          {/* Same button on both pages: Google does not distinguish signing up
              from signing in, and neither should the UI. */}
          <GoogleButton />
          <AuthDivider />
          <AuthForm mode="sign-up" redirectTo="/account" />
        </div>

        <p className="text-muted-foreground mt-4 text-sm">
          {t("haveAccount")}{" "}
          <Link href="/sign-in" className="text-primary font-semibold hover:underline">
            {t("signIn")}
          </Link>
        </p>
      </div>
    </div>
  );
}
