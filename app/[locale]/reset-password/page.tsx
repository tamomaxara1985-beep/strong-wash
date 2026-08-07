import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Link } from "@/i18n/navigation";
import { lookupResetToken } from "@/lib/auth/reset-token";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/reset-password">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return {
    title: t("resetTitle"),
    // A page whose URL contains a live credential must never be indexed.
    robots: { index: false, follow: false },
  };
}

export default async function ResetPasswordPage({
  params,
  searchParams,
}: PageProps<"/[locale]/reset-password">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");

  const { token } = await searchParams;
  const value = typeof token === "string" ? token : "";

  /**
   * Checked server-side before rendering the form, so a dead link says why
   * instead of collecting a password that cannot be saved. The token is not
   * spent here — only `confirm` does that, so opening the email twice still
   * works.
   */
  const lookup = value ? await lookupResetToken(value) : ({ ok: false, reason: "invalid" } as const);

  return (
    <div className="container-page py-12">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-display text-2xl">{t("resetTitle")}</h1>

        <div className="bg-card mt-6 rounded-lg border p-6">
          {lookup.ok ? (
            <ResetPasswordForm token={value} email={lookup.user.email} />
          ) : (
            <div className="flex flex-col gap-4">
              <p
                role="alert"
                className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
              >
                {lookup.reason === "expired"
                  ? t("tokenExpired")
                  : lookup.reason === "used"
                    ? t("tokenUsed")
                    : t("tokenInvalid")}
              </p>
              <Link
                href="/forgot-password"
                className="bg-brand-black inline-flex h-11 items-center justify-center rounded-md text-sm font-bold text-white"
              >
                {t("requestNewLink")}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
