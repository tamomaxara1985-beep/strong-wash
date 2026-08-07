"use client";

import { Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminCategoryRow } from "@/lib/queries/admin";
import { cn } from "@/lib/utils";

const LOCALES = ["ka", "en", "ru"] as const;
type Locale = (typeof LOCALES)[number];

/** Icons the storefront knows how to draw; anything else falls back to a box. */
const ICONS = [
  "",
  "gantry",
  "bay",
  "pressure",
  "vacuum",
  "water",
  "chemical",
  "foam",
  "dryer",
  "parts",
] as const;

function messageFor(code: string): string {
  switch (code) {
    case "taken":
      return "Another category already uses this slug.";
    case "required":
      return "Required.";
    case "slug_format":
      return "Lowercase letters, numbers and single hyphens only.";
    case "would_create_cycle":
      return "A category cannot sit inside itself or one of its own subcategories.";
    case "not_found":
      return "That parent no longer exists.";
    case "invalid":
      return "Not a valid choice.";
    default:
      return "Invalid.";
  }
}

export function CategoryForm({
  category,
  parents,
}: {
  category?: AdminCategoryRow;
  /** Selectable parents; the server also refuses a cycle. */
  parents: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("ka");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const [draft, setDraft] = useState({
    slug: category?.slug ?? "",
    name: {
      ka: category?.name.ka ?? "",
      en: category?.name.en ?? "",
      ru: category?.name.ru ?? "",
    } as Record<Locale, string>,
    description: {
      ka: category?.description?.ka ?? "",
      en: category?.description?.en ?? "",
      ru: category?.description?.ru ?? "",
    } as Record<Locale, string>,
    parentId: category?.parentId ?? "",
    icon: category?.icon ?? "",
    order: String(category?.order ?? 0),
    isActive: category?.isActive ?? true,
  });

  const fieldError = (key: string) => (fields[key] ? messageFor(fields[key]) : null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});

    const payload = {
      slug: draft.slug,
      name: { ka: draft.name.ka, en: draft.name.en || undefined, ru: draft.name.ru || undefined },
      description: {
        ka: draft.description.ka || undefined,
        en: draft.description.en || undefined,
        ru: draft.description.ru || undefined,
      },
      parentId: draft.parentId,
      icon: draft.icon,
      order: Number(draft.order || 0),
      isActive: draft.isActive,
    };

    try {
      const response = await fetch(
        category ? `/api/admin/categories/${category.id}` : "/api/admin/categories",
        {
          method: category ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (response.ok) {
        const body = (await response.json()) as {
          reindexed?: { categories: number; products: number };
        };
        // Moving a category rewrites its descendants and their products; saying so
        // makes a slow save legible rather than mysterious.
        const moved = body.reindexed;
        if (moved && moved.categories > 1) {
          window.alert(
            `Moved. ${moved.categories} categories and ${moved.products} products were reindexed.`,
          );
        }
        router.push("/admin/categories");
        router.refresh();
        return;
      }

      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        fields?: Record<string, string>;
      };
      if (body.fields) {
        setFields(body.fields);
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

  async function remove() {
    if (!category) return;
    if (!window.confirm(`Delete "${category.name.en ?? category.name.ka}"?`)) return;

    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/categories/${category.id}`, { method: "DELETE" });
      if (response.ok) {
        router.push("/admin/categories");
        router.refresh();
        return;
      }
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        children?: number;
        products?: number;
      };
      setError(
        body.error === "has_children"
          ? `It still has ${body.children} subcategor${body.children === 1 ? "y" : "ies"}. Delete or move those first.`
          : body.error === "has_products"
            ? `${body.products} product${body.products === 1 ? "" : "s"} sit${body.products === 1 ? "s" : ""} in this category. Move them elsewhere first, or untick "Active" to hide the category instead.`
            : "Could not delete that category.",
      );
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
              {category ? `/c${category.path}` : `…/c/${draft.slug || "…"}`}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="parent">Parent category</Label>
          <select
            id="parent"
            value={draft.parentId}
            onChange={(event) => setDraft({ ...draft, parentId: event.target.value })}
            aria-invalid={Boolean(fieldError("parentId"))}
            className="border-input bg-background h-10 rounded-md border px-2 text-sm"
          >
            <option value="">— top level —</option>
            {parents.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {fieldError("parentId") ? (
            <p className="text-destructive text-xs">{fieldError("parentId")}</p>
          ) : category && category.children > 0 ? (
            <p className="text-muted-foreground text-xs">
              Moving this also moves its {category.children} subcategor
              {category.children === 1 ? "y" : "ies"} and their products.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="icon">Icon</Label>
          <select
            id="icon"
            value={draft.icon}
            onChange={(event) => setDraft({ ...draft, icon: event.target.value })}
            className="border-input bg-background h-10 rounded-md border px-2 text-sm"
          >
            {ICONS.map((option) => (
              <option key={option || "none"} value={option}>
                {option || "— none —"}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">Shown in the menu and category tiles.</p>
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
          <Label htmlFor={`name-${locale}`}>Name</Label>
          <Input
            id={`name-${locale}`}
            value={draft.name[locale]}
            onChange={(event) =>
              setDraft({ ...draft, name: { ...draft.name, [locale]: event.target.value } })
            }
            aria-invalid={Boolean(fieldError(`name.${locale}`) ?? fieldError("name.ka"))}
            className="h-10"
          />
          {fieldError(`name.${locale}`) ?? fieldError("name.ka") ? (
            <p className="text-destructive text-xs">
              {fieldError(`name.${locale}`) ?? fieldError("name.ka")}
            </p>
          ) : null}
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
          <p className="text-muted-foreground text-xs">
            Shown under the heading on the category page.
          </p>
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
          Active — visible in the menu and on the site
        </label>
        {category && category.specCount > 0 ? (
          <span className="text-muted-foreground text-xs">
            {category.specCount} filter attribute{category.specCount === 1 ? "" : "s"} defined here
            (edited in code for now)
          </span>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} className="h-11 font-bold">
          <Save aria-hidden className="size-4" />
          {pending ? "Saving…" : category ? "Save changes" : "Create category"}
        </Button>
        {category ? (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={remove}
            className="text-destructive hover:bg-destructive/10"
          >
            <Trash2 aria-hidden className="size-4" />
            Delete
          </Button>
        ) : null}
      </div>
    </form>
  );
}
