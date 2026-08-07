"use client";

import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";

export function ResetPasswordForm({ token, email }: { token: string; email: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dead, setDead] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const password = String(new FormData(event.currentTarget).get("password") ?? "");

    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (response.ok) {
        setDone(true);
        // The response set a session cookie, so the layout has to be re-fetched
        // for the header to show the signed-in state.
        router.refresh();
        return;
      }

      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        fields?: Record<string, string>;
      };

      if (body.error === "token_expired") {
        setError(t("tokenExpired"));
        setDead(true);
      } else if (body.error === "token_used") {
        setError(t("tokenUsed"));
        setDead(true);
      } else if (body.error === "token_invalid") {
        setError(t("tokenInvalid"));
        setDead(true);
      } else if (body.fields?.password) {
        setError(t("passwordTooShort"));
      } else if (body.error === "rate_limited") {
        setError(t("rateLimited"));
      } else {
        setError(t("genericError"));
      }
    } catch {
      setError(t("genericError"));
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <CheckCircle2 aria-hidden className="size-9 text-green-600" />
        <p className="text-display text-lg">{t("resetDoneTitle")}</p>
        <p className="text-muted-foreground text-sm">{t("resetDoneText")}</p>
        <Link
          href="/account"
          className="bg-brand-black mt-2 inline-flex h-10 items-center rounded-md px-4 text-sm font-semibold text-white"
        >
          {t("goToAccount")}
        </Link>
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

      <p className="text-muted-foreground text-sm">{t("resetSubtitle", { email })}</p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{t("newPassword")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          aria-describedby="password-hint"
          className="h-10"
        />
        <p id="password-hint" className="text-muted-foreground text-xs">
          {t("passwordHint")}
        </p>
      </div>

      {/* Once the token is spent or expired, the form cannot succeed — offer the
          way forward instead of letting them retype a password for nothing. */}
      {dead ? (
        <Link
          href="/forgot-password"
          className="bg-brand-black inline-flex h-11 items-center justify-center rounded-md text-sm font-bold text-white"
        >
          {t("requestNewLink")}
        </Link>
      ) : (
        <Button type="submit" disabled={pending} className="h-11 w-full text-sm font-bold">
          {pending ? t("working") : t("resetSubmit")}
        </Button>
      )}
    </form>
  );
}
