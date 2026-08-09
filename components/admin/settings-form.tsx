"use client";

import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { derivedShades } from "@/lib/settings/colors";
import type { ResolvedSettings } from "@/lib/settings/defaults";
import { FONTS } from "@/lib/settings/fonts";
import { cn } from "@/lib/utils";

const LOCALES = ["ka", "en", "ru"] as const;
type Locale = (typeof LOCALES)[number];

function messageFor(code: string, ratio?: number): string {
  switch (code) {
    case "hex_format":
      return "Six-digit hex only, like #fec303.";
    case "low_contrast":
      return ratio
        ? `Too dark for the black text it carries — ${ratio}:1, needs 4.5:1.`
        : "Too dark for the text it carries.";
    case "invalid":
      return "Not one of the available choices.";
    case "required":
      return "Required.";
    default:
      return "Invalid.";
  }
}

export function SettingsForm({ settings }: { settings: ResolvedSettings }) {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("ka");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [ratio, setRatio] = useState<number | undefined>(undefined);

  const [draft, setDraft] = useState({
    phone: settings.phone,
    email: settings.email,
    address: { ...settings.address } as Record<Locale, string>,
    workHours: { ...settings.workHours } as Record<Locale, string>,
    brandYellow: settings.brandYellow,
    brandBlack: settings.brandBlack,
    fontKey: settings.fontKey,
  });

  const fieldError = (key: string) => (fields[key] ? messageFor(fields[key], ratio) : null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    setFields({});
    setRatio(undefined);

    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });

      if (response.ok) {
        setSaved(true);
        router.refresh();
        return;
      }

      const body = (await response.json().catch(() => ({}))) as {
        fields?: Record<string, string>;
        ratio?: number;
      };
      if (body.fields) {
        setFields(body.fields);
        setRatio(body.ratio);
        const localeKey = Object.keys(body.fields).find((key) => /\.(ka|en|ru)$/.test(key));
        const offending = localeKey?.split(".").pop() as Locale | undefined;
        if (offending && offending !== locale) setLocale(offending);
        setError(
          offending && offending !== locale
            ? `Some fields need attention — switched to ${offending.toUpperCase()}.`
            : "Some fields need attention.",
        );
      } else {
        setError("That did not save. Please try again.");
      }
    } catch {
      setError("That did not save. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const shades = /^#[0-9a-fA-F]{6}$/.test(draft.brandYellow)
    ? derivedShades(draft.brandYellow)
    : null;

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      {error ? (
        <p role="alert" className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
          Saved. The site updates on its next render.
        </p>
      ) : null}

      <section className="bg-card grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            value={draft.phone}
            onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
            className="h-10"
          />
          <p className="text-muted-foreground text-xs">Shown in the header, footer and on every product page.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={draft.email}
            onChange={(event) => setDraft({ ...draft, email: event.target.value })}
            aria-invalid={Boolean(fieldError("email"))}
            className="h-10"
          />
          {fieldError("email") ? (
            <p className="text-destructive text-xs">{fieldError("email")}</p>
          ) : (
            <p className="text-muted-foreground text-xs">Empty hides the footer email row entirely.</p>
          )}
        </div>
      </section>

      <section className="bg-card flex flex-col gap-4 rounded-lg border p-4">
        <div className="flex items-center gap-2">
          {LOCALES.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLocale(code)}
              className={cn(
                "inline-flex h-8 items-center rounded-md px-3 text-sm font-semibold uppercase transition-colors",
                locale === code ? "bg-brand-black text-white" : "hover:bg-secondary",
              )}
            >
              {code}
            </button>
          ))}
          <span className="text-muted-foreground ml-auto text-xs">Empty falls back to the built-in translation.</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`address-${locale}`}>Address</Label>
          <Input
            id={`address-${locale}`}
            value={draft.address[locale] ?? ""}
            onChange={(event) => setDraft({ ...draft, address: { ...draft.address, [locale]: event.target.value } })}
            aria-invalid={Boolean(fieldError(`address.${locale}`))}
            className="h-10"
          />
          {fieldError(`address.${locale}`) ? (
            <p className="text-destructive text-xs">{fieldError(`address.${locale}`)}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`hours-${locale}`}>Working hours</Label>
          <Input
            id={`hours-${locale}`}
            value={draft.workHours[locale] ?? ""}
            onChange={(event) => setDraft({ ...draft, workHours: { ...draft.workHours, [locale]: event.target.value } })}
            aria-invalid={Boolean(fieldError(`workHours.${locale}`))}
            className="h-10"
          />
          {fieldError(`workHours.${locale}`) ? (
            <p className="text-destructive text-xs">{fieldError(`workHours.${locale}`)}</p>
          ) : null}
        </div>
      </section>

      <section className="bg-card flex flex-col gap-4 rounded-lg border p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brandYellow">Brand colour</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(draft.brandYellow) ? draft.brandYellow : "#fec303"}
                onChange={(event) => setDraft({ ...draft, brandYellow: event.target.value })}
                className="h-10 w-14 rounded-md border"
                aria-label="Brand colour picker"
              />
              <Input
                id="brandYellow"
                value={draft.brandYellow}
                onChange={(event) => setDraft({ ...draft, brandYellow: event.target.value })}
                aria-invalid={Boolean(fieldError("brandYellow"))}
                className="text-data h-10"
              />
            </div>
            {fieldError("brandYellow") ? (
              <p className="text-destructive text-xs">{fieldError("brandYellow")}</p>
            ) : (
              <p className="text-muted-foreground text-xs">
                Carries black text, so it has to stay light. Hover shade{" "}
                {shades ? shades.light : "—"} is derived from it.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brandBlack">Ink colour</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(draft.brandBlack) ? draft.brandBlack : "#010101"}
                onChange={(event) => setDraft({ ...draft, brandBlack: event.target.value })}
                className="h-10 w-14 rounded-md border"
                aria-label="Ink colour picker"
              />
              <Input
                id="brandBlack"
                value={draft.brandBlack}
                onChange={(event) => setDraft({ ...draft, brandBlack: event.target.value })}
                aria-invalid={Boolean(fieldError("brandBlack"))}
                className="text-data h-10"
              />
            </div>
            {fieldError("brandBlack") ? (
              <p className="text-destructive text-xs">{fieldError("brandBlack")}</p>
            ) : (
              <p className="text-muted-foreground text-xs">Header and footer background. Carries white text.</p>
            )}
          </div>
        </div>

        {/* The refusal is never the first warning: this is what the colours do. */}
        <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
          <span
            className="inline-flex h-9 items-center rounded-md px-3 text-sm font-bold"
            style={{ backgroundColor: draft.brandYellow, color: "#101010" }}
          >
            Request a quote
          </span>
          <span
            className="inline-flex h-6 items-center rounded px-2 text-xs font-bold"
            style={{ backgroundColor: draft.brandYellow, color: "#101010" }}
          >
            −20%
          </span>
          <span
            className="inline-flex h-9 flex-1 items-center rounded-md px-3 text-sm"
            style={{ backgroundColor: draft.brandBlack, color: "#ffffff" }}
          >
            Strong Wash
          </span>
        </div>
      </section>

      <section className="bg-card flex flex-col gap-2 rounded-lg border p-4">
        <Label htmlFor="fontKey">Typeface</Label>
        <select
          id="fontKey"
          value={draft.fontKey}
          onChange={(event) => setDraft({ ...draft, fontKey: event.target.value })}
          aria-invalid={Boolean(fieldError("fontKey"))}
          className="border-input bg-background h-10 rounded-md border px-2 text-sm"
        >
          {FONTS.map((font) => (
            <option key={font.key} value={font.key}>
              {font.label}
            </option>
          ))}
        </select>
        {fieldError("fontKey") ? (
          <p className="text-destructive text-xs">{fieldError("fontKey")}</p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Body and headings. Georgian text keeps its own face regardless, and spec tables stay
            monospaced.
          </p>
        )}
      </section>

      <div>
        <Button type="submit" disabled={pending} className="h-11 font-bold">
          <Save aria-hidden className="size-4" />
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
