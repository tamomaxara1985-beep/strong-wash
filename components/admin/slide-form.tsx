"use client";

import { ImagePlus, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminSlideRow } from "@/lib/queries/admin";
import { isCloudinaryImageUrl, isSiteRelativePath } from "@/lib/slides/validate";
import { cn } from "@/lib/utils";

const LOCALES = ["ka", "en", "ru"] as const;
type Locale = (typeof LOCALES)[number];

type MediaOption = { id: string; url: string; title: string; width?: number; height?: number };

function messageFor(code: string): string {
  switch (code) {
    case "required":
      return "Required.";
    case "image_host":
      return "Pick an image from the media library — other hosts will not render.";
    case "href_not_relative":
      return "Must be a path on this site, starting with a single slash.";
    default:
      return "Invalid.";
  }
}

/**
 * One form for creating and editing a banner.
 *
 * The image is chosen from the media library rather than uploaded here: uploading
 * already exists at /admin/media, and picking is what also supplies the intrinsic
 * width and height that stop the homepage reflowing as the banner loads.
 */
export function SlideForm({
  slide,
  options,
}: {
  slide?: AdminSlideRow;
  options: { media: MediaOption[] };
}) {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("ka");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const [draft, setDraft] = useState({
    image: slide?.image ?? "",
    alt: {
      ka: slide?.alt.ka ?? "",
      en: slide?.alt.en ?? "",
      ru: slide?.alt.ru ?? "",
    } as Record<Locale, string>,
    href: slide?.href ?? "",
    width: slide?.width,
    height: slide?.height,
    order: String(slide?.order ?? 0),
    isActive: slide?.isActive ?? true,
  });

  const fieldError = (key: string) => (fields[key] ? messageFor(fields[key]) : null);

  function pick(asset: MediaOption) {
    setDraft({ ...draft, image: asset.url, width: asset.width, height: asset.height });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});

    const payload = {
      image: draft.image,
      alt: { ka: draft.alt.ka, en: draft.alt.en || undefined, ru: draft.alt.ru || undefined },
      href: draft.href,
      width: draft.width,
      height: draft.height,
      order: Number(draft.order || 0),
      isActive: draft.isActive,
    };

    try {
      const response = await fetch(slide ? `/api/admin/slides/${slide.id}` : "/api/admin/slides", {
        method: slide ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        router.push("/admin/slides");
        router.refresh();
        return;
      }

      const body = (await response.json().catch(() => ({}))) as {
        fields?: Record<string, string>;
      };
      if (body.fields) {
        setFields(body.fields);
        // A failure on a locale the operator is not looking at would otherwise
        // read as "some fields need attention" with every visible field fine.
        const localeKey = Object.keys(body.fields).find((key) => /\.(ka|en|ru)$/.test(key));
        const offending = localeKey?.split(".").pop() as Locale | undefined;
        if (offending && offending !== locale) setLocale(offending);

        // "image" and "href" render their own inline message, and a dotted alt
        // key is handled above by switching to the locale it names. Any other
        // key — "order", "isActive", a future field — has no field-level
        // renderer, so it must be named here or the operator sees no clue at all.
        const unnamed = Object.keys(body.fields).filter(
          (key) => key !== "image" && key !== "href" && !/\.(ka|en|ru)$/.test(key),
        );

        setError(
          unnamed.length
            ? `Some fields need attention: ${unnamed.join(", ")}.`
            : offending && offending !== locale
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

  // Mirrors the server rules so the operator is told before a round trip; the
  // handler enforces them regardless.
  const imageWarning =
    draft.image && !isCloudinaryImageUrl(draft.image)
      ? "That image is not from the media library and will not render on the site."
      : null;
  const hrefWarning =
    draft.href && !isSiteRelativePath(draft.href)
      ? "A link must stay on this site — start it with a single slash."
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

      <section className="bg-card flex flex-col gap-4 rounded-lg border p-4">
        <div className="flex flex-col gap-1.5">
          <Label>Banner image</Label>
          {draft.image ? (
            <div className="bg-brand-black flex items-center justify-center rounded-lg p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={draft.image} alt="" className="max-h-56 w-auto object-contain" />
            </div>
          ) : (
            <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
              No image chosen yet. Pick one below.
            </p>
          )}
          {fieldError("image") ? (
            <p className="text-destructive text-xs">{fieldError("image")}</p>
          ) : imageWarning ? (
            <p className="text-destructive text-xs">{imageWarning}</p>
          ) : draft.width && draft.height ? (
            <p className="text-muted-foreground text-xs">
              {draft.width}×{draft.height}. Shown whole on a black backdrop — nothing is cropped.
            </p>
          ) : null}
        </div>

        {options.media.length ? (
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-xs">
              <ImagePlus aria-hidden className="mr-1 inline size-3.5" />
              Media library
            </p>
            <ul className="flex flex-wrap gap-2">
              {options.media.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    onClick={() => pick(asset)}
                    title={asset.title}
                    className={cn(
                      "focus-visible:ring-ring rounded border p-0.5 transition-colors focus-visible:ring-2 focus-visible:outline-none",
                      draft.image === asset.url ? "border-primary" : "hover:border-primary",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={asset.url} alt={asset.title} className="size-14 object-cover" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            The media library is empty. Upload the banners at Media library first.
          </p>
        )}
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
              {!draft.alt[code] ? (
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
          <Label htmlFor={`alt-${locale}`}>Alt text</Label>
          <Input
            id={`alt-${locale}`}
            value={draft.alt[locale]}
            onChange={(event) =>
              setDraft({ ...draft, alt: { ...draft.alt, [locale]: event.target.value } })
            }
            aria-invalid={Boolean(fieldError(`alt.${locale}`) ?? fieldError("alt.ka"))}
            className="h-10"
          />
          {fieldError(`alt.${locale}`) ?? fieldError("alt.ka") ? (
            <p className="text-destructive text-xs">
              {fieldError(`alt.${locale}`) ?? fieldError("alt.ka")}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              The banner&rsquo;s words are inside the picture, so this is all a screen reader or
              Google ever sees. Describe what it offers, not &ldquo;banner&rdquo;.
            </p>
          )}
        </div>
      </section>

      <section className="bg-card grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="href">Links to (optional)</Label>
          <Input
            id="href"
            value={draft.href}
            onChange={(event) => setDraft({ ...draft, href: event.target.value })}
            aria-invalid={Boolean(fieldError("href"))}
            placeholder="/c/automatic-systems"
            className="text-data h-10"
          />
          {fieldError("href") ? (
            <p className="text-destructive text-xs">{fieldError("href")}</p>
          ) : hrefWarning ? (
            <p className="text-destructive text-xs">{hrefWarning}</p>
          ) : (
            <p className="text-muted-foreground text-xs">
              A path on this site. Leave empty for a banner that is not clickable.
            </p>
          )}
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
          <p className="text-muted-foreground text-xs">Lower numbers come first.</p>
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
          Active — shown on the homepage
        </label>
      </section>

      <div>
        <Button type="submit" disabled={pending} className="h-11 font-bold">
          <Save aria-hidden className="size-4" />
          {pending ? "Saving…" : slide ? "Save changes" : "Create banner"}
        </Button>
      </div>
    </form>
  );
}
