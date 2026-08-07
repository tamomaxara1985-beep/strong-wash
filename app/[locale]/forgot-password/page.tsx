import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/forgot-password">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("forgotTitle"), robots: { index: false, follow: false } };
}

export default async function ForgotPasswordPage({
  params,
}: PageProps<"/[locale]/forgot-password">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");

  return (
    <div className="container-page py-12">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-display text-2xl">{t("forgotTitle")}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{t("forgotSubtitle")}</p>

        <div className="bg-card mt-6 rounded-lg border p-6">
          <ForgotPasswordForm />
        </div>

        <p className="text-muted-foreground mt-4 text-sm">
          <Link href="/sign-in" className="text-primary font-semibold hover:underline">
            {t("signIn")}
          </Link>
        </p>
      </div>
    </div>
  );
}
