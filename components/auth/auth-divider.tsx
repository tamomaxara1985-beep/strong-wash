import { getTranslations } from "next-intl/server";

/** "or" between the Google button and the password form. */
export async function AuthDivider() {
  const t = await getTranslations("auth");

  return (
    <div className="flex items-center gap-3" aria-hidden>
      <span className="bg-border h-px flex-1" />
      <span className="text-muted-foreground text-xs uppercase">{t("or")}</span>
      <span className="bg-border h-px flex-1" />
    </div>
  );
}
