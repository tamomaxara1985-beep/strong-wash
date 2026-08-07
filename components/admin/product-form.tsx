"use client";

import { ImagePlus, Save, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminProductDetail, ProductFormOptions } from "@/lib/queries/admin";
import type { LocalizedString, SpecDefinition } from "@/lib/types";
import { cn } from "@/lib/utils";

const LOCALES = ["ka", "en", "ru"] as const;
type Locale = (typeof LOCALES)[number];

const STOCK_STATUSES = ["in_stock", "low", "out", "preorder"] as const;

type Draft = {
  sku: string;
  slug: string;
  name: Record<Locale, string>;
  shortDescription: Record<Locale, string>;
  description: Record<Locale, string>;
  brandId: string;
  categoryId: string;
  price: string;
  salePrice: string;
  stock: string;
  stockStatus: string;
  isActive: boolean;
  isFeatured: boolean;
  images: { url: string; alt: Record<Locale, string> }[];
  specs: Record<string, string>;
};

function fromLocalized(value: LocalizedString | undefined): Record<Locale, string> {
  return { ka: value?.ka ?? "", en: value?.en ?? "", ru: value?.ru ?? "" };
}

function toLocalized(value: Record<Locale, string>): LocalizedString {
  return { ka: value.ka, en: value.en || undefined, ru: value.ru || undefined };
}

/** Field-level codes from the API, rendered next to the input they belong to. */
function messageFor(code: string): string {
  switch (code) {
    case "taken":
      return "Already used by another product.";
    case "required":
      return "Required.";
    case "slug_format":
      return "Lowercase letters, numbers and single hyphens only.";
    case "not_a_number":
      return "Must be a number.";
    case "not_an_option":
      return "Not one of the allowed values.";
    case "not_in_schema":
      return "This attribute does not belong to the chosen category.";
    case "not_below_price":
      return "Sale price must be below the regular price.";
    case "not_found":
      return "No longer exists.";
    default:
      return "Invalid.";
  }
}

export function ProductForm({
  product,
  options,
}: {
  product?: AdminProductDetail;
  options: ProductFormOptions;
}) {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("ka");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const [draft, setDraft] = useState<Draft>(() => ({
    sku: product?.sku ?? "",
    slug: product?.slug ?? "",
    name: fromLocalized(product?.name),
    shortDescription: fromLocalized(product?.shortDescription),
    description: fromLocalized(product?.description),
    brandId: product?.brandId ?? options.brands[0]?.id ?? "",
    categoryId: product?.categoryId ?? options.categories[0]?.id ?? "",
    price: product ? String(product.price) : "",
    salePrice: product?.salePrice != null ? String(product.salePrice) : "",
    stock: product ? String(product.stock) : "0",
    stockStatus: product?.stockStatus ?? "preorder",
    isActive: product?.isActive ?? true,
    isFeatured: product?.isFeatured ?? false,
    images: (product?.images ?? []).map((image) => ({
      url: image.url,
      alt: fromLocalized(image.alt),
    })),
    specs: Object.fromEntries(
      Object.entries(product?.specs ?? {}).map(([key, value]) => [key, String(value)]),
    ),
  }));

  /**
   * The spec inputs are driven by the chosen category's effective schema, which
   * already includes attributes inherited from its ancestors. Changing the
   * category therefore changes which fields exist.
   */
  const schema: SpecDefinition[] = useMemo(
    () => options.categories.find((c) => c.id === draft.categoryId)?.specSchema ?? [],
    [options.categories, draft.categoryId],
  );

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const setLocalized = (
    key: "name" | "shortDescription" | "description",
    value: string,
  ) => setDraft((current) => ({ ...current, [key]: { ...current[key], [locale]: value } }));

  function addImage(url: string, title: string) {
    if (draft.images.some((image) => image.url === url)) return;
    setDraft((current) => ({
      ...current,
      images: [...current.images, { url, alt: { ka: title, en: title, ru: title } }],
    }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});

    const payload = {
      sku: draft.sku,
      slug: draft.slug,
      name: toLocalized(draft.name),
      shortDescription: toLocalized(draft.shortDescription),
      description: toLocalized(draft.description),
      brandId: draft.brandId,
      categoryId: draft.categoryId,
      price: Number(draft.price || 0),
      // Empty means "no sale", which the API expects as null rather than 0.
      salePrice: draft.salePrice.trim() === "" ? null : Number(draft.salePrice),
      stock: Number(draft.stock || 0),
      stockStatus: draft.stockStatus,
      images: draft.images.map((image) => ({ url: image.url, alt: toLocalized(image.alt) })),
      // Blank values are dropped: the write layer treats a missing key as "not
      // specified" rather than an error.
      specs: Object.fromEntries(Object.entries(draft.specs).filter(([, v]) => v !== "")),
      isActive: draft.isActive,
      isFeatured: draft.isFeatured,
    };

    try {
      const response = await fetch(
        product ? `/api/admin/products/${product.id}` : "/api/admin/products",
        {
          method: product ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (response.ok) {
        router.push("/admin/products");
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
      } else if (body.error === "forbidden" || body.error === "unauthenticated") {
        setError("Your session no longer has admin access. Sign in again.");
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
    if (!product) return;
    if (!window.confirm(`Delete ${product.sku}? This cannot be undone.`)) return;

    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, { method: "DELETE" });
      if (response.ok) {
        router.push("/admin/products");
        router.refresh();
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string; quotes?: number };
      setError(
        body.error === "referenced_by_quotes"
          ? `${body.quotes} quote request${body.quotes === 1 ? "" : "s"} reference this product, so deleting it would break that history. Untick "Active" instead — that removes it from the site and keeps the record.`
          : "Could not delete that product.",
      );
    } finally {
      setPending(false);
    }
  }

  const fieldError = (key: string) => (fields[key] ? messageFor(fields[key]) : null);

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

      <section className="bg-card flex flex-col gap-4 rounded-lg border p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sku">SKU</Label>
            <Input
              id="sku"
              value={draft.sku}
              onChange={(event) => set("sku", event.target.value)}
              aria-invalid={Boolean(fieldError("sku"))}
              className="h-10"
              required
            />
            {fieldError("sku") ? (
              <p className="text-destructive text-xs">{fieldError("sku")}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="slug">URL slug</Label>
            <Input
              id="slug"
              value={draft.slug}
              onChange={(event) => set("slug", event.target.value)}
              aria-invalid={Boolean(fieldError("slug"))}
              className="h-10"
              required
            />
            {fieldError("slug") ? (
              <p className="text-destructive text-xs">{fieldError("slug")}</p>
            ) : (
              <p className="text-muted-foreground text-xs">/p/{draft.slug || "…"}</p>
            )}
          </div>
        </div>
      </section>

      {/* Per-locale tabs. Georgian is required because pickLocale falls back to
          it — an empty `ka` renders as blank, not as English. */}
      <section className="bg-card flex flex-col gap-4 rounded-lg border p-4">
        <div className="flex items-center gap-2">
          {LOCALES.map((code) => {
            const incomplete = !draft.name[code] || !draft.shortDescription[code];
            return (
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
                {incomplete ? (
                  <span
                    aria-label="incomplete"
                    className={cn(
                      "size-1.5 rounded-full",
                      code === "ka" ? "bg-destructive" : "bg-amber-500",
                    )}
                  />
                ) : null}
              </button>
            );
          })}
          <span className="text-muted-foreground ml-auto text-xs">
            {locale === "ka" ? "Required" : "Falls back to Georgian if empty"}
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`name-${locale}`}>Name</Label>
          <Input
            id={`name-${locale}`}
            value={draft.name[locale]}
            onChange={(event) => setLocalized("name", event.target.value)}
            aria-invalid={Boolean(fieldError("name.ka"))}
            className="h-10"
          />
          {fieldError("name.ka") && locale === "ka" ? (
            <p className="text-destructive text-xs">{fieldError("name.ka")}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`short-${locale}`}>Short description</Label>
          <textarea
            id={`short-${locale}`}
            rows={2}
            value={draft.shortDescription[locale]}
            onChange={(event) => setLocalized("shortDescription", event.target.value)}
            className="border-input bg-background focus-visible:border-primary w-full rounded-md border px-3 py-2 text-sm outline-none"
          />
          {fieldError("shortDescription.ka") && locale === "ka" ? (
            <p className="text-destructive text-xs">{fieldError("shortDescription.ka")}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`desc-${locale}`}>Full description</Label>
          <textarea
            id={`desc-${locale}`}
            rows={6}
            value={draft.description[locale]}
            onChange={(event) => setLocalized("description", event.target.value)}
            className="border-input bg-background focus-visible:border-primary w-full rounded-md border px-3 py-2 text-sm outline-none"
          />
          {fieldError("description.ka") && locale === "ka" ? (
            <p className="text-destructive text-xs">{fieldError("description.ka")}</p>
          ) : null}
        </div>
      </section>

      <section className="bg-card grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brand">Brand</Label>
          <select
            id="brand"
            value={draft.brandId}
            onChange={(event) => set("brandId", event.target.value)}
            className="border-input bg-background h-10 rounded-md border px-2 text-sm"
          >
            {options.brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="category">Category</Label>
          <select
            id="category"
            value={draft.categoryId}
            onChange={(event) => set("categoryId", event.target.value)}
            className="border-input bg-background h-10 rounded-md border px-2 text-sm"
          >
            {options.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">Decides which attributes appear below.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="price">Price, GEL</Label>
          <Input
            id="price"
            type="number"
            min={0}
            value={draft.price}
            onChange={(event) => set("price", event.target.value)}
            className="h-10"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="salePrice">Sale price, GEL (optional)</Label>
          <Input
            id="salePrice"
            type="number"
            min={0}
            value={draft.salePrice}
            onChange={(event) => set("salePrice", event.target.value)}
            aria-invalid={Boolean(fieldError("salePrice"))}
            className="h-10"
          />
          {fieldError("salePrice") ? (
            <p className="text-destructive text-xs">{fieldError("salePrice")}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="stock">Units held</Label>
          <Input
            id="stock"
            type="number"
            min={0}
            value={draft.stock}
            onChange={(event) => set("stock", event.target.value)}
            className="h-10"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="stockStatus">Availability</Label>
          <select
            id="stockStatus"
            value={draft.stockStatus}
            onChange={(event) => set("stockStatus", event.target.value)}
            className="border-input bg-background h-10 rounded-md border px-2 text-sm"
          >
            {STOCK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
      </section>

      {schema.length ? (
        <section className="bg-card flex flex-col gap-3 rounded-lg border p-4">
          <h2 className="text-sm font-semibold">
            Attributes
            <span className="text-muted-foreground ml-2 font-normal">
              from the chosen category, including inherited ones
            </span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {schema.map((def) => {
              const value = draft.specs[def.key] ?? "";
              const onChange = (next: string) =>
                setDraft((current) => ({ ...current, specs: { ...current.specs, [def.key]: next } }));
              const label = def.label.en ?? def.label.ka;

              return (
                <div key={def.key} className="flex flex-col gap-1.5">
                  <Label htmlFor={`spec-${def.key}`}>
                    {label}
                    {def.unit ? (
                      <span className="text-muted-foreground font-normal"> ({def.unit})</span>
                    ) : null}
                  </Label>

                  {def.type === "enum" ? (
                    <select
                      id={`spec-${def.key}`}
                      value={value}
                      onChange={(event) => onChange(event.target.value)}
                      className="border-input bg-background h-10 rounded-md border px-2 text-sm"
                    >
                      <option value="">—</option>
                      {(def.options ?? []).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label.en ?? option.label.ka}
                        </option>
                      ))}
                    </select>
                  ) : def.type === "bool" ? (
                    <label className="flex h-10 items-center gap-2 text-sm">
                      <input
                        id={`spec-${def.key}`}
                        type="checkbox"
                        checked={value === "true"}
                        onChange={(event) => onChange(event.target.checked ? "true" : "")}
                        className="size-4"
                      />
                      yes
                    </label>
                  ) : (
                    <Input
                      id={`spec-${def.key}`}
                      type="number"
                      value={value}
                      onChange={(event) => onChange(event.target.value)}
                      aria-invalid={Boolean(fieldError(`specs.${def.key}`))}
                      className="h-10"
                    />
                  )}

                  {fieldError(`specs.${def.key}`) ? (
                    <p className="text-destructive text-xs">{fieldError(`specs.${def.key}`)}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="bg-card flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-sm font-semibold">Images</h2>

        {draft.images.length ? (
          <ul className="flex flex-wrap gap-2">
            {draft.images.map((image, index) => (
              <li key={image.url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt={image.alt.en || image.alt.ka}
                  className="size-20 rounded border object-cover"
                />
                <button
                  type="button"
                  onClick={() =>
                    set(
                      "images",
                      draft.images.filter((_, i) => i !== index),
                    )
                  }
                  className="bg-background absolute -top-2 -right-2 rounded-full border p-1 shadow-sm"
                >
                  <X aria-hidden className="size-3" />
                  <span className="sr-only">Remove image</span>
                </button>
                {index === 0 ? (
                  <Badge className="absolute bottom-1 left-1 text-[10px]">cover</Badge>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            No images yet. Pick from the media library below — the first one is the cover.
          </p>
        )}

        {options.media.length ? (
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-xs">
              <ImagePlus aria-hidden className="mr-1 inline size-3.5" />
              Media library
            </p>
            <ul className="flex flex-wrap gap-2">
              {options.media
                .filter((asset) => asset.isImage)
                .map((asset) => (
                  <li key={asset.id}>
                    <button
                      type="button"
                      onClick={() => addImage(asset.url, asset.title)}
                      title={asset.title}
                      className="hover:border-primary focus-visible:ring-ring rounded border p-0.5 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={asset.url} alt={asset.title} className="size-14 object-cover" />
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">
            The media library is empty. Upload files under Media library first.
          </p>
        )}
      </section>

      <section className="bg-card flex flex-wrap items-center gap-5 rounded-lg border p-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(event) => set("isActive", event.target.checked)}
            className="size-4"
          />
          Active — visible on the site
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={draft.isFeatured}
            onChange={(event) => set("isFeatured", event.target.checked)}
            className="size-4"
          />
          Featured on the home page
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} className="h-11 font-bold">
          <Save aria-hidden className="size-4" />
          {pending ? "Saving…" : product ? "Save changes" : "Create product"}
        </Button>
        {product ? (
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
