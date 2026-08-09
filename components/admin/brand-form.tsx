"use client";

import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminBrandRow } from "@/lib/queries/admin";
import { cn } from "@/lib/utils";

const LOCALES = ["ka", "en", "ru"] as const;
type Locale = (typeof LOCALES)[number];

function messageFor(code: string): string {
  switch (code) {
    case "taken":
      return "Another brand already uses this slug.";
    case "required":
      return "Required.";
    case "slug_format":
      return "Lowercase letters, numbers and single hyphens only.";
    default:
      return "Invalid.";
  }
}

/**
 * One form for both create and edit.
 *
 * The name is a single field, not a per-locale one: manufacturer names are proper
 * nouns and the model stores one string for all three locales. Only the optional
 * description is translated.
 */
export function BrandForm({ brand }: { brand?: AdminBrandRow }) {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("ka");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const [draft, setDraft] = useState({
    slug: brand?.slug ?? "",
    name: brand?.name ?? "",
    description: {
      ka: brand?.description?.ka ?? "",
      en: brand?.description?.en ?? "",
      ru: brand?.description?.ru ?? "",
    } as Record<Locale, string>,
    order: String(brand?.order ?? 0),
    isActive: brand?.isActive ?? true,
  });

  const fieldError = (key: string) => (fields[key] ? messageFor(fields[key]) : null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});

    const payload = {
      slug: draft.slug,
      name: draft.name,
      description: {
        ka: draft.description.ka || undefined,
        en: draft.description.en || undefined,
        ru: draft.description.ru || undefined,
      },
      order: Number(draft.order || 0),
      isActive: draft.isActive,
    };

    try {
      const response = await fetch(brand ? `/api/admin/brands/${brand.id}` : "/api/admin/brands", {
        method: brand ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const body = (await response.json()) as { repaired?: number };
        // A rename rewrites the search text of every product on the brand; saying
        // so makes a slow save legible rather than mysterious.
        if (body.repaired) {
          window.alert(
            `Saved. ${body.repaired} product${body.repaired === 1 ? "" : "s"} reindexed for the new name.`,
          );
        }
        router.push("/admin/brands");
        router.refresh();
        return;
      }

      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        fields?: Record<string, string>;
      };
      if (body.fields) {
        setFields(body.fields);
        setError("Some fields need attention.");
      } else {
        setError("That did not save. Please try again.");
      }
    } catch {
      setError("That did not save. Please try again.");
    } finally {
      setPending(false);
    }
  }

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
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            aria-invalid={Boolean(fieldError("name"))}
            className="h-10"
            required
          />
          {fieldError("name") ? (
            <p className="text-destructive text-xs">{fieldError("name")}</p>
          ) : (
            <p className="text-muted-foreground text-xs">
              The same in all three languages — Kärcher, WashTec, Istobal.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="slug">URL slug</Label>
          <Input
            id="slug"
            value={draft.slug}
            onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
            aria-invalid={Boolean(fieldError("slug"))}
            className="h-10"
            required
          />
          {fieldError("slug") ? (
            <p className="text-destructive text-xs">{fieldError("slug")}</p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Used in filter links: ?brand={draft.slug || "…"}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="order">Sort order</Label>
          <Input
            id="order"
            type="number"
            min={0}
            value={draft.order}
            onChange={(event) => setDraft({ ...draft, order: event.target.value })}
            className="h-10"
          />
          <p className="text-muted-foreground text-xs">Lower numbers come first.</p>
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
            </button>
          ))}
          <span className="text-muted-foreground ml-auto text-xs">
            Description is optional in every language.
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`desc-${locale}`}>Description (optional)</Label>
          <textarea
            id={`desc-${locale}`}
            rows={3}
            value={draft.description[locale]}
            onChange={(event) =>
              setDraft({
                ...draft,
                description: { ...draft.description, [locale]: event.target.value },
              })
            }
            className="border-input bg-background focus-visible:border-primary w-full rounded-md border px-3 py-2 text-sm outline-none"
          />
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
          Active — offered as a filter on the site
        </label>
        {brand && brand.productCount > 0 ? (
          <span className="text-muted-foreground text-xs">
            {brand.productCount} product{brand.productCount === 1 ? "" : "s"} use this brand. Hiding
            it removes the filter; they stay listed under this name.
          </span>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} className="h-11 font-bold">
          <Save aria-hidden className="size-4" />
          {pending ? "Saving…" : brand ? "Save changes" : "Create brand"}
        </Button>
      </div>
    </form>
  );
}
