"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";

type Mode = "sign-in" | "sign-up";

/**
 * Maps a route's error code to a translated message.
 *
 * The server sends codes, never prose: the same failure has to read correctly in
 * three locales, and `invalid_credentials` deliberately covers both "no such
 * account" and "wrong password" so the response cannot be used to enumerate
 * addresses.
 */
function messageFor(code: string | undefined, t: (key: string) => string): string {
  switch (code) {
    case "invalid_credentials":
      return t("invalidCredentials");
    case "email_taken":
      return t("emailTaken");
    case "rate_limited":
      return t("rateLimited");
    case "database_not_configured":
    case "database_unavailable":
      return t("databaseUnavailable");
    default:
      return t("genericError");
  }
}

/** Field codes from the Zod schemas, translated where a specific string exists. */
function fieldMessage(code: string | undefined, t: (key: string) => string): string | undefined {
  if (!code) return undefined;
  if (code === "too_short") return t("passwordTooShort");
  if (code.toLowerCase().includes("email")) return t("emailInvalid");
  return undefined;
}

export function AuthForm({ mode, redirectTo }: { mode: Mode; redirectTo: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});

    const form = new FormData(event.currentTarget);
    const payload =
      mode === "sign-up"
        ? {
            name: String(form.get("name") ?? ""),
            email: String(form.get("email") ?? ""),
            password: String(form.get("password") ?? ""),
            phone: String(form.get("phone") ?? ""),
            company: String(form.get("company") ?? ""),
          }
        : {
            email: String(form.get("email") ?? ""),
            password: String(form.get("password") ?? ""),
          };

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        // The session cookie is set by the response, so the destination has to be
        // fetched fresh — a cached RSC payload would still render as signed out.
        router.replace(redirectTo);
        router.refresh();
        return;
      }

      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        fields?: Record<string, string>;
      };
      if (body.fields) setFields(body.fields);
      setError(messageFor(body.error, t));
    } catch {
      setError(t("genericError"));
    } finally {
      setPending(false);
    }
  }

  const emailError = fieldMessage(fields.email, t);
  const passwordError = fieldMessage(fields.password, t);
  const nameError = fields.name ? t("nameTooShort") : undefined;

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

      {mode === "sign-up" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">{t("name")}</Label>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            required
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? "name-error" : undefined}
            className="h-10"
          />
          {nameError ? (
            <p id="name-error" className="text-destructive text-xs">
              {nameError}
            </p>
          ) : null}
        </div>
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
          aria-invalid={Boolean(emailError)}
          aria-describedby={emailError ? "email-error" : undefined}
          className="h-10"
        />
        {emailError ? (
          <p id="email-error" className="text-destructive text-xs">
            {emailError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{t("password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          // `new-password` tells a password manager to offer a generated one on
          // sign-up and not to autofill the existing one.
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          required
          minLength={mode === "sign-up" ? 10 : undefined}
          aria-invalid={Boolean(passwordError)}
          aria-describedby={
            passwordError ? "password-error" : mode === "sign-up" ? "password-hint" : undefined
          }
          className="h-10"
        />
        {passwordError ? (
          <p id="password-error" className="text-destructive text-xs">
            {passwordError}
          </p>
        ) : mode === "sign-up" ? (
          <p id="password-hint" className="text-muted-foreground text-xs">
            {t("passwordHint")}
          </p>
        ) : null}
      </div>

      {mode === "sign-up" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">
              {t("phone")}{" "}
              <span className="text-muted-foreground font-normal">({t("optional")})</span>
            </Label>
            <Input id="phone" name="phone" type="tel" autoComplete="tel" className="h-10" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company">
              {t("company")}{" "}
              <span className="text-muted-foreground font-normal">({t("optional")})</span>
            </Label>
            <Input
              id="company"
              name="company"
              autoComplete="organization"
              className="h-10"
            />
          </div>
        </div>
      ) : null}

      <Button type="submit" disabled={pending} className="h-11 w-full text-sm font-bold">
        {pending ? t("working") : mode === "sign-up" ? t("signUp") : t("signIn")}
      </Button>
    </form>
  );
}
