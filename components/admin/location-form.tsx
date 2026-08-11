"use client";

import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAP_HOSTS, isMapUrl } from "@/lib/locations/validate";
import type { AdminLocationRow } from "@/lib/queries/admin";
import { cn } from "@/lib/utils";

const LOCALES = ["ka", "en", "ru"] as const;
type Locale = (typeof LOCALES)[number];

function messageFor(code: string): string {
  switch (code) {
    case "required":
      return "Required.";
    case "map_host":
      return `Google Maps links only — ${MAP_HOSTS.join(", ")}.`;
    case "last_active_location":
      return "This is the only branch currently shown on the site. Activate another branch first, then this one can be unticked.";
    case "phone_too_short":
      return "A number needs at least 3 characters, or leave it empty.";
    case "same_as_phone":
      return "Same as the primary number. Leave it empty instead.";
    default:
      return "Invalid.";
  }
}

/**
 * One form for creating and editing a branch.
 *
 * Name, address and hours are per-language. Neither phone is: a telephone number
 * is not translated. The first is the primary, shown across the site; the second
 * is optional and appears on the locations page only.
 */
export function LocationForm({ location }: { location?: AdminLocationRow }) {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("ka");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const [draft, setDraft] = useState({
    name: {
      ka: location?.name.ka ?? "",
      en: location?.name.en ?? "",
      ru: location?.name.ru ?? "",
    } as Record<Locale, string>,
    phone: location?.phone ?? "",
    phone2: location?.phone2 ?? "",
    email: location?.email ?? "",
    address: {
      ka: location?.address.ka ?? "",
      en: location?.address.en ?? "",
      ru: location?.address.ru ?? "",
    } as Record<Locale, string>,
    workHours: {
      ka: location?.workHours.ka ?? "",
      en: location?.workHours.en ?? "",
      ru: location?.workHours.ru ?? "",
    } as Record<Locale, string>,
    mapUrl: location?.mapUrl ?? "",
    order: String(location?.order ?? 0),
    isActive: location?.isActive ?? true,
  });

  const fieldError = (key: string) => (fields[key] ? messageFor(fields[key]) : null);

  const localized = (key: "name" | "address" | "workHours", value: string) =>
    setDraft({ ...draft, [key]: { ...draft[key], [locale]: value } });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});

    const trilingual = (value: Record<Locale, string>) => ({
      ka: value.ka,
      en: value.en || undefined,
      ru: value.ru || undefined,
    });

    const payload = {
      name: trilingual(draft.name),
      phone: draft.phone,
      phone2: draft.phone2,
      email: draft.email,
      address: trilingual(draft.address),
      workHours: trilingual(draft.workHours),
      mapUrl: draft.mapUrl,
      order: Number(draft.order || 0),
      isActive: draft.isActive,
    };

    try {
      const response = await fetch(
        location ? `/api/admin/locations/${location.id}` : "/api/admin/locations",
        {
          method: location ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (response.ok) {
        router.push("/admin/locations");
        router.refresh();
        return;
      }

      const body = (await response.json().catch(() => ({}))) as {
        fields?: Record<string, string>;
        error?: string;
      };
      if (body.fields) {
        setFields(body.fields);
        // A failure on a language the operator is not looking at would otherwise
        // read as "some fields need attention" with every visible field fine.
        const localeKey = Object.keys(body.fields).find((key) => /\.(ka|en|ru)$/.test(key));
        const offending = localeKey?.split(".").pop() as Locale | undefined;
        if (offending && offending !== locale) setLocale(offending);
        setError(
          offending && offending !== locale
            ? `Some fields need attention — switched to ${offending.toUpperCase()}.`
            : "Some fields need attention.",
        );
      } else if (body.error === "last_active_location") {
        setError(messageFor(body.error));
      } else {
        setError("That did not save. Please try again.");
      }
    } catch {
      setError("That did not save. Please try again.");
    } finally {
      setPending(false);
    }
  }

  // Mirrors the server rule so the operator is told before a round trip; the
  // handler enforces it regardless.
  const mapWarning =
    draft.mapUrl && !isMapUrl(draft.mapUrl)
      ? `That is not a Google Maps link. Allowed: ${MAP_HOSTS.join(", ")}.`
      : null;

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      {error ? (
        <p
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
        >
          {error}
        </p>
      ) : null}

      <section className="bg-card grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            value={draft.phone}
            onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
            aria-invalid={Boolean(fieldError("phone"))}
            className="text-data h-10"
            required
          />
          {fieldError("phone") ? (
            <p className="text-destructive text-xs">{fieldError("phone")}</p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Primary — the number the header and product pages show.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone2">Second phone (optional)</Label>
          <Input
            id="phone2"
            value={draft.phone2}
            onChange={(event) => setDraft({ ...draft, phone2: event.target.value })}
            aria-invalid={Boolean(fieldError("phone2"))}
            className="text-data h-10"
          />
          {fieldError("phone2") ? (
            <p className="text-destructive text-xs">{fieldError("phone2")}</p>
          ) : (
            <p className="text-muted-foreground text-xs">Shown on the locations page only.</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email (optional)</Label>
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
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="order">Sort order</Label>
          <Input
            id="order"
            type="number"
            min={0}
            max={9999}
            value={draft.order}
            onChange={(event) => setDraft({ ...draft, order: event.target.value })}
            className="h-10"
          />
          <p className="text-muted-foreground text-xs">
            Lower comes first. The first branch is the one the header shows.
          </p>
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="mapUrl">Map link (optional)</Label>
          <Input
            id="mapUrl"
            value={draft.mapUrl}
            onChange={(event) => setDraft({ ...draft, mapUrl: event.target.value })}
            aria-invalid={Boolean(fieldError("mapUrl"))}
            placeholder="https://maps.app.goo.gl/…"
            className="text-data h-10"
          />
          {fieldError("mapUrl") ? (
            <p className="text-destructive text-xs">{fieldError("mapUrl")}</p>
          ) : mapWarning ? (
            <p className="text-destructive text-xs">{mapWarning}</p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Shown as a &ldquo;Directions&rdquo; link. Google Maps only.
            </p>
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
                "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-semibold uppercase transition-colors",
                locale === code ? "bg-brand-black text-white" : "hover:bg-secondary",
              )}
            >
              {code}
              {!draft.name[code] ? (
                <span
                  aria-label="incomplete"
                  className={cn(
                    "size-1.5 rounded-full",
                    code === "ka" ? "bg-destructive" : "bg-amber-500",
                  )}
                />
              ) : null}
            </button>
          ))}
          <span className="text-muted-foreground ml-auto text-xs">
            {locale === "ka" ? "Required" : "Falls back to Georgian if empty"}
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`name-${locale}`}>Branch name</Label>
          <Input
            id={`name-${locale}`}
            value={draft.name[locale]}
            onChange={(event) => localized("name", event.target.value)}
            aria-invalid={Boolean(fieldError(`name.${locale}`))}
            className="h-10"
          />
          {fieldError(`name.${locale}`) ? (
            <p className="text-destructive text-xs">{fieldError(`name.${locale}`)}</p>
          ) : (
            <p className="text-muted-foreground text-xs">
              How visitors tell your branches apart — a district or street, not the company.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`address-${locale}`}>Address</Label>
          <Input
            id={`address-${locale}`}
            value={draft.address[locale]}
            onChange={(event) => localized("address", event.target.value)}
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
            value={draft.workHours[locale]}
            onChange={(event) => localized("workHours", event.target.value)}
            aria-invalid={Boolean(fieldError(`workHours.${locale}`))}
            className="h-10"
          />
          {fieldError(`workHours.${locale}`) ? (
            <p className="text-destructive text-xs">{fieldError(`workHours.${locale}`)}</p>
          ) : null}
        </div>
      </section>

      <section className="bg-card flex flex-wrap items-center gap-5 rounded-lg border p-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })}
            className="size-4"
          />
          Active — shown on the site
        </label>
      </section>

      <div>
        <Button type="submit" disabled={pending} className="h-11 font-bold">
          <Save aria-hidden className="size-4" />
          {pending ? "Saving…" : location ? "Save changes" : "Create location"}
        </Button>
      </div>
    </form>
  );
}
