"use client";

import { MailCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const email = String(new FormData(event.currentTarget).get("email") ?? "");

    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, locale }),
      });

      if (response.ok) {
        /**
         * Shown whether or not the address has an account — the endpoint answers
         * identically on purpose, so the UI must not imply otherwise. Telling the
         * user "no such account" here would let anyone test which of their
         * customers' addresses are registered.
         */
        setSent(true);
        return;
      }

      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(
        body.error === "rate_limited"
          ? t("rateLimited")
          : body.error === "email_not_configured"
            ? t("emailNotConfigured")
            : t("genericError"),
      );
    } catch {
      setError(t("genericError"));
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <MailCheck aria-hidden className="size-9 text-green-600" />
        <p className="text-display text-lg">{t("forgotSentTitle")}</p>
        <p className="text-muted-foreground text-sm">{t("forgotSentText")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {error ? (
        <p
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          className="h-10"
        />
      </div>

      <Button type="submit" disabled={pending} className="h-11 w-full text-sm font-bold">
        {pending ? t("working") : t("forgotSubmit")}
      </Button>
    </form>
  );
}
