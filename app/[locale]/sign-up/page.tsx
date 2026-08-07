import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";
import { Link } from "@/i18n/navigation";
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

export default async function SignUpPage({ params }: PageProps<"/[locale]/sign-up">) {
  const { locale } = await params;
  setRequestLocale(locale);

  if (await getSession()) redirect(`/${locale}/account`);

  const t = await getTranslations("auth");

  return (
    <div className="container-page py-12">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-display text-2xl">{t("signUpTitle")}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{t("signUpSubtitle")}</p>

        <div className="bg-card mt-6 rounded-lg border p-6">
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
