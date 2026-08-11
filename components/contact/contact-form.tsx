"use client";

import { CheckCircle2, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The contact form.
 *
 * On success the form is replaced by a confirmation rather than cleared and
 * shown again: a cleared form invites a second submission of the same message.
 * A failure leaves every field as typed — losing someone's paragraph because
 * their email had a typo is the worst thing a form can do.
 *
 * `noValidate` hands validation to the route rather than the browser, so the
 * messages are ours, translated, and consistent with what the server enforces.
 */
export function ContactForm({ locale }: { locale: string }) {
  const t = useTranslations("contact");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const messageFor = (code: string) => {
    switch (code) {
      case "required":
        return t("errorRequired");
      case "email":
        return t("errorEmail");
      case "too_long":
        return t("errorTooLong");
      default:
        return t("errorGeneric");
    }
  };

  const fieldError = (key: string) => (fields[key] ? messageFor(fields[key]) : null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});

    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      subject: String(form.get("subject") ?? ""),
      message: String(form.get("message") ?? ""),
      website: String(form.get("website") ?? ""),
      locale,
    };

    try {
      const response = await fetch("/api/contact-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setDone(true);
        return;
      }

      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        fields?: Record<string, string>;
      };
      if (body.fields) {
        setFields(body.fields);
        setError(t("errorFields"));
      } else if (body.error === "rate_limited") {
        setError(t("errorRateLimited"));
      } else {
        setError(t("errorGeneric"));
      }
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="bg-card flex flex-col items-center gap-3 rounded-xl border p-8 text-center">
        <CheckCircle2 aria-hidden className="size-10 text-green-600" />
        <h2 className="text-display text-lg">{t("successTitle")}</h2>
        <p className="text-muted-foreground text-sm">{t("successText")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="bg-card flex flex-col gap-4 rounded-xl border p-5" noValidate>
      <h2 className="text-display text-lg">{t("formTitle")}</h2>

      {error ? (
        <p
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="c-name">{t("name")}</Label>
        <Input id="c-name" name="name" aria-invalid={Boolean(fieldError("name"))} required />
        {fieldError("name") ? <p className="text-destructive text-xs">{fieldError("name")}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="c-email">{t("email")}</Label>
        <Input
          id="c-email"
          name="email"
          type="email"
          aria-invalid={Boolean(fieldError("email"))}
          required
        />
        {fieldError("email") ? (
          <p className="text-destructive text-xs">{fieldError("email")}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="c-phone">
          {t("phone")}{" "}
          <span className="text-muted-foreground font-normal">({t("optional")})</span>
        </Label>
        <Input id="c-phone" name="phone" className="text-data" aria-invalid={Boolean(fieldError("phone"))} />
        {fieldError("phone") ? (
          <p className="text-destructive text-xs">{fieldError("phone")}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="c-subject">{t("subject")}</Label>
        <Input id="c-subject" name="subject" aria-invalid={Boolean(fieldError("subject"))} required />
        {fieldError("subject") ? (
          <p className="text-destructive text-xs">{fieldError("subject")}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="c-message">{t("message")}</Label>
        <textarea
          id="c-message"
          name="message"
          rows={6}
          placeholder={t("messagePlaceholder")}
          aria-invalid={Boolean(fieldError("message"))}
          required
          className="border-input bg-background focus-visible:ring-ring aria-invalid:border-destructive w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
        />
        {fieldError("message") ? (
          <p className="text-destructive text-xs">{fieldError("message")}</p>
        ) : null}
      </div>

      {/*
        The honeypot. Hidden from sight AND from screen readers, and marked
        autocomplete="off" so a browser never helpfully fills it in — a real
        person must never be able to trip this. The route treats a non-empty
        value as a bot.
      */}
      <div aria-hidden className="hidden">
        <label htmlFor="c-website">Website</label>
        <input id="c-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <Button
          type="submit"
          disabled={pending}
          className="bg-brand-yellow hover:bg-brand-yellow-dark h-11 text-sm font-bold text-black"
        >
          <Send aria-hidden className="size-4" />
          {pending ? t("sending") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
