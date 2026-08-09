# Homepage Hero Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the homepage hero with a scrollable carousel of admin-managed promotional banners, managed at `/admin/slides`.

**Architecture:** A `HeroSlide` singleton-free collection shaped like `Brand`, read by a `cache()`-wrapped query that the homepage already-existing `Promise.all` picks up. The carousel is a client component built on native CSS scroll-snap — arrows, dots and autoplay all drive the same `scrollBy`, so swipe and keyboard scrolling come from the browser rather than from a library. With no active slides the page renders today's hero unchanged.

**Tech Stack:** Next.js 16 (App Router, `PageProps`/`RouteContext` typed helpers), React 19, Mongoose 9, Zod, Tailwind v4, next-intl (storefront), Cloudinary via the existing media library.

**Spec:** `docs/superpowers/specs/2026-08-09-homepage-hero-carousel-design.md`

## Global Constraints

- **Read the Next.js docs first.** `AGENTS.md` requires it — this version has breaking changes versus training data. Guides live in `node_modules/next/dist/docs/`. `RouteContext<"/api/admin/slides/[id]">` and `PageProps<"/admin/slides/[id]">` are globals, and `params` is always a Promise. Copy the shapes from `app/api/admin/brands/[id]/route.ts` and `app/admin/brands/[id]/page.tsx`.
- **The admin tree is unlocalised, English-only.** `proxy.ts` excludes `/admin` from the next-intl middleware. No `next-intl` imports in admin pages or components. The storefront carousel IS localised and uses `next-intl` normally.
- **Every admin API handler runs `assertSameOrigin(request)` then `requireAdmin()`, in that order, before anything else** — both from `@/lib/auth/guard`.
- **Error shapes come from `@/lib/api`:** `validationError({field: code})`, `notFoundJson("slide")`, `apiError(error)` in every catch.
- **`alt.ka` is required.** The banner text lives inside the image, so `alt` is the entire accessible content of a slide.
- **The image URL must be a Cloudinary delivery URL** on the path allowed by `next.config.ts` `remotePatterns` (`res.cloudinary.com/<cloud>/**`). A foreign host throws inside `next/image` at render time, on the homepage, for every visitor.
- **`href` must be site-relative:** starts with a single `/`, never `//`, never a scheme. Anything else turns the homepage banner into an off-site link.
- **Nothing is ever cropped.** Every slide image is `object-contain` on `bg-brand-black`.
- **Autoplay must not run when the visitor asks for reduced motion**, and must pause on hover, on focus within, and when the tab is hidden.
- **No test runner exists in this repo and adding one is forbidden.** Verification is `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run verify:slides` (created in Task 1), and a browser pass.
- **Two shims are needed for any database script in this environment**, both outside the repo, neither a code defect: `--require <scratchpad>/dns-fix.cjs` (Node's resolver refuses `mongodb+srv`) and, only if the script imports `lib/settings/fonts.ts`, `--require <scratchpad>/font-fix.cjs`. This plan's script needs only the DNS one.
- **Commit after every task.** Conventional Commits, English prose.

---

## File Structure

**Create:**
- `lib/models/hero-slide.ts` — the model.
- `lib/slides/validate.ts` — the two URL rules, as pure functions shared by the API and the form.
- `lib/queries/slides.ts` — `getHeroSlides()`.
- `app/api/admin/slides/route.ts` — POST.
- `app/api/admin/slides/[id]/route.ts` — PATCH, DELETE.
- `app/admin/slides/page.tsx` — list.
- `app/admin/slides/new/page.tsx`, `app/admin/slides/[id]/page.tsx` — create and edit.
- `components/admin/slide-form.tsx` — shared form with the media picker.
- `components/admin/slide-row-actions.tsx` — per-row edit and delete.
- `components/home/hero-carousel.tsx` — the carousel.
- `scripts/verify-slides.ts` — DB-level checks.

**Modify:**
- `lib/types.ts` — the `HeroSlide` read type.
- `lib/queries/map.ts` — `toHeroSlide`.
- `lib/auth/schemas.ts` — `slideSchema`.
- `lib/queries/admin.ts` — `listAdminSlides`, `getAdminSlide`, `getSlideFormOptions`.
- `app/admin/layout.tsx` — nav entry.
- `app/[locale]/page.tsx` — read slides, render the carousel or the old hero, drop the dead hero reads.
- `messages/{ka,en,ru}.json` — carousel labels.
- `package.json` — `verify:slides`.

---

### Task 1: Model, types, query, verification harness

**Files:**
- Create: `lib/models/hero-slide.ts`, `lib/queries/slides.ts`, `scripts/verify-slides.ts`
- Modify: `lib/types.ts`, `lib/queries/map.ts`, `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `HeroSlide` model and `HeroSlideDocument` from `lib/models/hero-slide.ts`
  - `type HeroSlide = { id: string; image: string; alt: LocalizedString; href?: string; width?: number; height?: number; order: number; isActive: boolean }` in `lib/types.ts`
  - `toHeroSlide(doc)` in `lib/queries/map.ts`
  - `getHeroSlides(): Promise<HeroSlide[]>` from `lib/queries/slides.ts`
  - `npm run verify:slides`

- [ ] **Step 1: Write the model**

Create `lib/models/hero-slide.ts`:

```ts
import { type InferSchemaType, type Model, Schema, model, models } from "mongoose";

import { localizedStringSchema } from "./shared";

/**
 * A promotional banner on the homepage.
 *
 * `alt` is `localizedStringSchema`, whose `ka` is required, because the artwork
 * carries its message inside the picture: without alt text a screen reader and a
 * search engine get nothing at all from a slide.
 *
 * `width` and `height` are copied from the chosen media asset rather than
 * measured at render time — `next/image` needs the intrinsic ratio to reserve
 * space, and without it the largest element above the fold reflows as it loads.
 */
const heroSlideSchema = new Schema(
  {
    image: { type: String, required: true, trim: true },
    alt: { type: localizedStringSchema, required: true },
    /** Site-relative path, e.g. "/c/sand-washing". Optional: a slide may be inert. */
    href: { type: String, trim: true },
    width: { type: Number },
    height: { type: Number },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

heroSlideSchema.index({ isActive: 1, order: 1 });

export type HeroSlideDocument = InferSchemaType<typeof heroSlideSchema>;

/**
 * `models.HeroSlide ??` is not optional: dev hot reload re-runs this module
 * against a connection that already has the model compiled, and a second
 * `model()` call throws OverwriteModelError.
 */
export const HeroSlide: Model<HeroSlideDocument> =
  (models.HeroSlide as Model<HeroSlideDocument>) ??
  model<HeroSlideDocument>("HeroSlide", heroSlideSchema);
```

- [ ] **Step 2: Add the read type**

In `lib/types.ts`, after the `Brand` type (around line 38):

```ts
export type HeroSlide = {
  id: string;
  image: string;
  alt: LocalizedString;
  href?: string;
  width?: number;
  height?: number;
  order: number;
  isActive: boolean;
};
```

- [ ] **Step 3: Add the mapper**

In `lib/queries/map.ts`, after `toBrand`. The file already has `idToString`, `localized` and a `LeanLocalized` type — reuse them rather than writing new ones.

```ts
type LeanHeroSlide = {
  _id: Id;
  image: string;
  alt?: LeanLocalized;
  href?: string | null;
  width?: number | null;
  height?: number | null;
  order?: number;
  isActive?: boolean;
};

export function toHeroSlide(doc: LeanHeroSlide): HeroSlide {
  return {
    id: idToString(doc._id),
    image: doc.image,
    alt: localized(doc.alt),
    href: doc.href?.trim() || undefined,
    width: doc.width ?? undefined,
    height: doc.height ?? undefined,
    order: doc.order ?? 0,
    isActive: doc.isActive ?? true,
  };
}
```

Add `HeroSlide` to the existing `import type { ... } from "../types"` line at the top of the file rather than adding a second import statement.

- [ ] **Step 4: Write the query**

Create `lib/queries/slides.ts`:

```ts
import { cache } from "react";

import { connectToDatabase } from "../db";
import { HeroSlide as HeroSlideModel } from "../models/hero-slide";
import type { HeroSlide } from "../types";
import { toHeroSlide } from "./map";

/**
 * The active banners, in display order.
 *
 * An empty result is a normal state, not a failure: the homepage renders its
 * original hero when there are no slides, which is what makes this feature
 * reversible without a deploy and what covers the window before the first banner
 * is uploaded.
 */
export const getHeroSlides = cache(async (): Promise<HeroSlide[]> => {
  await connectToDatabase();
  const docs = await HeroSlideModel.find({ isActive: true }).sort({ order: 1 }).lean();
  return docs.map(toHeroSlide);
});
```

- [ ] **Step 5: Write the verification script**

Create `scripts/verify-slides.ts`, modelled on the existing `scripts/verify-brands.ts` — same `check()` helper, same prefix-and-cleanup discipline. Slides have no slug, so fixtures are identified by a marker inside `alt.ka`.

```ts
/**
 * DB-level checks for the hero carousel.
 *
 * Run with `npm run verify:slides`. Every fixture it creates carries the marker
 * below in `alt.ka` and is removed in the `finally`, including when an assertion
 * throws, so a failed run leaves nothing behind. It writes to whatever
 * MONGODB_URI points at, exactly like the seed script.
 */
import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";

import { HeroSlide } from "../lib/models/hero-slide";

loadEnvConfig(process.cwd());

const MARKER = "zzz-verify-slide";
let passed = 0;

function check(label: string, condition: boolean) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  passed += 1;
  console.log(`  ok  ${label}`);
}

async function cleanup() {
  await HeroSlide.deleteMany({ "alt.ka": { $regex: MARKER } });
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);

  try {
    await cleanup();

    const base = "https://res.cloudinary.com/hva1f8dq/image/upload/v1/";
    await HeroSlide.create({
      image: `${base}b.jpg`,
      alt: { ka: `${MARKER} second` },
      order: 20,
      isActive: true,
    });
    await HeroSlide.create({
      image: `${base}a.jpg`,
      alt: { ka: `${MARKER} first`, en: "first EN" },
      order: 10,
      isActive: true,
    });
    await HeroSlide.create({
      image: `${base}c.jpg`,
      alt: { ka: `${MARKER} hidden` },
      order: 30,
      isActive: false,
    });

    const { getHeroSlides } = await import("../lib/queries/slides");
    const slides = (await getHeroSlides()).filter((s) => s.alt.ka.includes(MARKER));

    check("slides come back in order", slides[0]?.alt.ka.endsWith("first") === true);
    check("and the second is second", slides[1]?.alt.ka.endsWith("second") === true);
    check("an inactive slide is absent", slides.length === 2);
    check("an unset en falls back to ka", slides[1]?.alt.en === slides[1]?.alt.ka);
    check("a set en wins", slides[0]?.alt.en === "first EN");
    check("href is undefined when unset", slides[0]?.href === undefined);

    await HeroSlide.updateMany({ "alt.ka": { $regex: MARKER } }, { $set: { isActive: false } });
    const none = (await import("../lib/queries/slides")).getHeroSlides;
    const empty = (await none()).filter((s) => s.alt.ka.includes(MARKER));
    check("with none active the query returns an empty list", empty.length === 0);
  } finally {
    await cleanup();
    await mongoose.disconnect();
  }

  console.log(`\n${passed} checks passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Note on the re-read: `getHeroSlides` is `cache()`-wrapped, which memoises per React request scope. In a plain script each call re-reads, which the last check depends on. If that check fails because it sees the first read's result, replace the second call with a direct `HeroSlideModel.find({ isActive: true })` and assert on that instead — and say so in your report. Do not delete the check.

- [ ] **Step 6: Register the script**

In `package.json`, after `"verify:settings"`:

```json
    "verify:slides": "tsx scripts/verify-slides.ts",
```

- [ ] **Step 7: Run it**

Run: `NODE_OPTIONS="--require <scratchpad>/dns-fix.cjs" npm run verify:slides`
Expected: seven `ok` lines then `7 checks passed`, and no leftover fixtures. Run it a second time — a clean second run proves the cleanup worked.

- [ ] **Step 8: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. If tsc reports errors inside `.next/dev/types/`, that is a corrupted gitignored artifact from a running dev server: delete `.next/dev/types`, run `npx next typegen`, re-run.

- [ ] **Step 9: Commit**

```bash
git add lib/models/hero-slide.ts lib/queries/slides.ts lib/types.ts lib/queries/map.ts scripts/verify-slides.ts package.json
git commit -m "feat: read hero slides for the homepage carousel

A slide is an image, required alt text, an optional site-relative link and a sort
order. alt.ka is required because the banner artwork carries its message inside
the picture: without it a screen reader and a search engine get nothing from a
slide at all.

An empty result is a normal state rather than a failure — the homepage keeps its
original hero until the first banner is added."
```

---

### Task 2: The two URL rules

**Files:**
- Create: `lib/slides/validate.ts`
- Modify: `scripts/verify-slides.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces, from `lib/slides/validate.ts`:
  - `isCloudinaryImageUrl(value: string): boolean`
  - `isSiteRelativePath(value: string): boolean`

- [ ] **Step 1: Write the module**

Create `lib/slides/validate.ts`. Pure functions, no database and no React: both the API route and the client form import them.

```ts
/**
 * The two rules that keep a slide from breaking the page it renders on.
 *
 * Pure and dependency-free, because the client form and the route handler both
 * need them and neither should import the other.
 */

/**
 * `next/image` refuses any host absent from `next.config.ts` remotePatterns, and
 * it refuses it at render time — on the homepage, for every visitor, not on the
 * admin page where the wrong URL was pasted. So the URL is checked where the
 * mistake is still cheap.
 *
 * The cloud name comes from the environment when it is set, matching the
 * `res.cloudinary.com/<cloud>/**` pattern in next.config.ts. With it unset — a
 * script, or a misconfigured deploy — the host check alone still holds.
 */
export function isCloudinaryImageUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com") return false;

  const cloud = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  if (!cloud) return true;
  return url.pathname.startsWith(`/${cloud}/`);
}

/**
 * A slide's link must stay on this site.
 *
 * An absolute URL would turn the homepage banner into an off-site link, and a
 * `javascript:` value into something worse. A leading `//` is rejected too: the
 * browser reads it as protocol-relative and it leaves the site just as surely as
 * `https://` does.
 */
export function isSiteRelativePath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//");
}
```

- [ ] **Step 2: Add checks for both rules**

In `scripts/verify-slides.ts`, inside the `try` block after the existing checks:

```ts
    const { isCloudinaryImageUrl, isSiteRelativePath } = await import("../lib/slides/validate");

    check(
      "a cloudinary delivery url is accepted",
      isCloudinaryImageUrl("https://res.cloudinary.com/hva1f8dq/image/upload/v1/a.jpg"),
    );
    for (const bad of [
      "https://evil.example/a.jpg",
      "http://res.cloudinary.com/hva1f8dq/a.jpg",
      "/local/a.jpg",
      "javascript:alert(1)",
      "",
    ]) {
      check(`the image rule refuses ${JSON.stringify(bad)}`, !isCloudinaryImageUrl(bad));
    }

    check("a relative path is accepted", isSiteRelativePath("/c/sand-washing"));
    for (const bad of ["https://evil.example", "//evil.example", "javascript:alert(1)", "c/x", ""]) {
      check(`the href rule refuses ${JSON.stringify(bad)}`, !isSiteRelativePath(bad));
    }
```

Note: `isCloudinaryImageUrl` consults `CLOUDINARY_CLOUD_NAME`, which the script loads from `.env.local` through `loadEnvConfig`. If your `.env.local` cloud name is not `hva1f8dq`, the first check fails legitimately — change the fixture URLs in this script and in Task 1's to your own cloud name rather than weakening the function, and say so in your report.

- [ ] **Step 3: Run the checks**

Run: `NODE_OPTIONS="--require <scratchpad>/dns-fix.cjs" npm run verify:slides`
Expected: `19 checks passed`.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/slides/validate.ts scripts/verify-slides.ts
git commit -m "feat: validate slide image hosts and link targets

Both rules exist to stop a slide breaking the page it renders on. next/image
refuses a host that is not in remotePatterns at render time, on the homepage, for
every visitor — so the URL is checked while the mistake is still cheap. And a
link that is not site-relative turns the banner into an off-site link, with
protocol-relative // leaving the site just as surely as https:// does."
```

---

### Task 3: Schema and API

**Files:**
- Modify: `lib/auth/schemas.ts`
- Create: `app/api/admin/slides/route.ts`, `app/api/admin/slides/[id]/route.ts`

**Interfaces:**
- Consumes: `HeroSlide`, `isCloudinaryImageUrl`, `isSiteRelativePath`.
- Produces the contract the form codes against:
  - `POST /api/admin/slides` → `201 { id }`
  - `PATCH /api/admin/slides/[id]` → `200 { id }`
  - `DELETE /api/admin/slides/[id]` → `200 { deleted }`
  - `422 { error: "validation_failed", fields: {...} }` with codes `required`, `image_host`, `href_not_relative`

- [ ] **Step 1: Add the schema**

In `lib/auth/schemas.ts`, after `settingsSchema`. `localizedRequired` already exists in this file and makes `ka` required — use it rather than defining another localized shape.

```ts
/**
 * `alt` is `localizedRequired`, so Georgian alt text cannot be empty: the banner
 * carries its message inside the artwork, and alt is all a screen reader or a
 * crawler ever sees.
 *
 * The image and href rules are enforced in the route handler rather than here,
 * because both depend on runtime configuration and both need to report a
 * specific field code the form renders.
 */
export const slideSchema = z.object({
  image: z.string().trim().min(1, "required").max(500),
  alt: localizedRequired,
  href: z.string().trim().max(200).optional().or(z.literal("")),
  width: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.coerce.number().int().min(1).max(20000).optional(),
  ),
  height: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.coerce.number().int().min(1).max(20000).optional(),
  ),
  order: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? 0 : value),
    z.coerce.number().int().min(0).max(9999),
  ),
  isActive: z.boolean().default(true),
});
```

- [ ] **Step 2: Write the create handler**

Create `app/api/admin/slides/route.ts`:

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, validationError } from "@/lib/api";
import { assertSameOrigin, requireAdmin } from "@/lib/auth/guard";
import { fieldErrors, slideSchema } from "@/lib/auth/schemas";
import { connectToDatabase } from "@/lib/db";
import { HeroSlide } from "@/lib/models/hero-slide";
import { isCloudinaryImageUrl, isSiteRelativePath } from "@/lib/slides/validate";

/** Creates a homepage banner. */
export async function POST(request: NextRequest) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const parsed = slideSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(fieldErrors(parsed.error));

    if (!isCloudinaryImageUrl(parsed.data.image)) {
      return validationError({ image: "image_host" });
    }

    const href = parsed.data.href?.trim();
    if (href && !isSiteRelativePath(href)) {
      return validationError({ href: "href_not_relative" });
    }

    await connectToDatabase();

    const doc = new HeroSlide({
      image: parsed.data.image,
      alt: parsed.data.alt,
      href: href || undefined,
      width: parsed.data.width,
      height: parsed.data.height,
      order: parsed.data.order,
      isActive: parsed.data.isActive,
    });
    await doc.save();

    return NextResponse.json({ id: String(doc._id) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
```

- [ ] **Step 3: Write the update and delete handlers**

Create `app/api/admin/slides/[id]/route.ts`:

```ts
import { Types } from "mongoose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, notFoundJson, validationError } from "@/lib/api";
import { assertSameOrigin, requireAdmin } from "@/lib/auth/guard";
import { fieldErrors, slideSchema } from "@/lib/auth/schemas";
import { connectToDatabase } from "@/lib/db";
import { HeroSlide } from "@/lib/models/hero-slide";
import { isCloudinaryImageUrl, isSiteRelativePath } from "@/lib/slides/validate";

/** Updates a banner. */
export async function PATCH(request: NextRequest, context: RouteContext<"/api/admin/slides/[id]">) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) return notFoundJson("slide");

    const parsed = slideSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(fieldErrors(parsed.error));

    if (!isCloudinaryImageUrl(parsed.data.image)) {
      return validationError({ image: "image_host" });
    }

    const href = parsed.data.href?.trim();
    if (href && !isSiteRelativePath(href)) {
      return validationError({ href: "href_not_relative" });
    }

    await connectToDatabase();
    const slide = await HeroSlide.findById(id);
    if (!slide) return notFoundJson("slide");

    slide.image = parsed.data.image;
    slide.alt = parsed.data.alt;
    slide.href = href || undefined;
    slide.width = parsed.data.width;
    slide.height = parsed.data.height;
    slide.order = parsed.data.order;
    slide.isActive = parsed.data.isActive;
    await slide.save();

    return NextResponse.json({ id: String(slide._id) });
  } catch (error) {
    return apiError(error);
  }
}

/**
 * Deletes a banner.
 *
 * Unguarded, unlike a brand or a category: nothing references a slide, so
 * removing one only removes it. The image itself stays in the media library.
 */
export async function DELETE(request: NextRequest, context: RouteContext<"/api/admin/slides/[id]">) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) return notFoundJson("slide");

    await connectToDatabase();
    const slide = await HeroSlide.findById(id).select("_id");
    if (!slide) return notFoundJson("slide");

    await slide.deleteOne();
    return NextResponse.json({ deleted: id });
  } catch (error) {
    return apiError(error);
  }
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. If `RouteContext<"/api/admin/slides/[id]">` is reported as unknown, the new route is not yet in the generated types — run `npx next typegen`, then re-run.

- [ ] **Step 5: Smoke-test the guard**

With `npm run dev` running:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/admin/slides \
  -H "Content-Type: application/json" -d '{"image":"x","alt":{"ka":"x"}}'
```

Expected: `401` — no session, so `requireAdmin` rejects before any write. (`403` is the signed-in-non-admin case; either is a pass.) Anything 2xx means a guard is missing.

- [ ] **Step 6: Commit**

```bash
git add lib/auth/schemas.ts app/api/admin/slides
git commit -m "feat: slide create, update and delete endpoints

The image host and the link shape are checked in the handler rather than in the
schema: both depend on runtime configuration, and both need to report a field
code the form can explain.

Deleting is unguarded, unlike a brand — nothing references a slide, and the image
itself stays in the media library."
```

---

### Task 4: Admin reads and the list page

**Files:**
- Modify: `lib/queries/admin.ts`, `app/admin/layout.tsx`
- Create: `app/admin/slides/page.tsx`, `components/admin/slide-row-actions.tsx`

**Interfaces:**
- Consumes: the `HeroSlide` model and the DELETE contract.
- Produces:
  - `type AdminSlideRow = { id: string; image: string; alt: LocalizedString; href?: string; width?: number; height?: number; order: number; isActive: boolean }`
  - `listAdminSlides(): Promise<AdminSlideRow[]>`, `getAdminSlide(id: string): Promise<AdminSlideRow | null>`
  - `getSlideFormOptions(): Promise<{ media: { id: string; url: string; title: string; width?: number; height?: number }[] }>`
  - `<SlideRowActions id={string} label={string} />`

- [ ] **Step 1: Add the admin reads**

In `lib/queries/admin.ts`, after the brand block. `Types`, `connectToDatabase`, `MediaAsset` and `LocalizedString` are already imported at the top of this file — add only `HeroSlide` to the imports.

```ts
export type AdminSlideRow = {
  id: string;
  image: string;
  alt: LocalizedString;
  href?: string;
  width?: number;
  height?: number;
  order: number;
  isActive: boolean;
};

/**
 * Every slide, inactive ones included: the storefront hides those, which is
 * exactly why the panel has to show them.
 */
export async function listAdminSlides(): Promise<AdminSlideRow[]> {
  await connectToDatabase();
  const docs = await HeroSlide.find({}).sort({ order: 1 }).lean();

  return docs.map((doc) => ({
    id: String(doc._id),
    image: doc.image,
    alt: {
      ka: doc.alt?.ka ?? "",
      en: doc.alt?.en ?? undefined,
      ru: doc.alt?.ru ?? undefined,
    },
    href: doc.href?.trim() || undefined,
    width: doc.width ?? undefined,
    height: doc.height ?? undefined,
    order: doc.order ?? 0,
    isActive: doc.isActive ?? true,
  }));
}

export async function getAdminSlide(id: string): Promise<AdminSlideRow | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  const all = await listAdminSlides();
  return all.find((row) => row.id === id) ?? null;
}

/**
 * Images the slide form can choose from.
 *
 * Separate from `getProductFormOptions` because a slide needs the intrinsic
 * dimensions, which the product picker does not carry, and needs none of the
 * categories or spec schemas that make that read expensive.
 */
export async function getSlideFormOptions(): Promise<{
  media: { id: string; url: string; title: string; width?: number; height?: number }[];
}> {
  await connectToDatabase();
  const assets = await MediaAsset.find({ resourceType: "image" })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  return {
    media: assets.map((asset) => ({
      id: String(asset._id),
      url: asset.url,
      title: asset.title,
      width: asset.width ?? undefined,
      height: asset.height ?? undefined,
    })),
  };
}
```

- [ ] **Step 2: Add the nav entry**

In `app/admin/layout.tsx`, add `GalleryHorizontal` to the `lucide-react` import (keep the list alphabetical) and add to `NAV`, directly after the Dashboard entry:

```ts
  { href: "/admin/slides", label: "Homepage banners", icon: GalleryHorizontal },
```

- [ ] **Step 3: Write the row actions**

Create `components/admin/slide-row-actions.tsx`:

```tsx
"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Per-row edit and delete.
 *
 * Delete lives on the list because that is where the decision to remove a banner
 * is made. Nothing references a slide, so the server has no guard to surface —
 * only the session errors are worth distinguishing.
 */
export function SlideRowActions({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(`Delete "${label}"?\n\nThe image stays in the media library.`)) return;

    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/slides/${id}`, { method: "DELETE" });
      if (response.ok) {
        router.refresh();
        return;
      }

      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (body.error === "forbidden" || body.error === "unauthenticated") {
        setError("Your session no longer has admin access. Sign in again.");
      } else {
        setError("Could not delete that banner.");
      }
    } catch {
      setError("Could not delete that banner.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex justify-end gap-1.5">
        <Link
          href={`/admin/slides/${id}`}
          className="hover:bg-secondary focus-visible:ring-ring inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <Pencil aria-hidden className="size-3.5" />
          Edit
        </Link>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={remove}
          className="text-destructive hover:bg-destructive/10"
        >
          <Trash2 aria-hidden className="size-3.5" />
          {pending ? "Deleting…" : "Delete"}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-destructive max-w-64 text-right text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Write the list page**

Create `app/admin/slides/page.tsx`:

```tsx
import { Plus } from "lucide-react";
import Link from "next/link";

import { SlideRowActions } from "@/components/admin/slide-row-actions";
import { Badge } from "@/components/ui/badge";
import { listAdminSlides } from "@/lib/queries/admin";

export default async function AdminSlidesPage() {
  const slides = await listAdminSlides();
  const active = slides.filter((slide) => slide.isActive).length;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display text-2xl">Homepage banners</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {active} shown on the homepage, {slides.length} in total. With none active the
            homepage falls back to its original header.
          </p>
        </div>
        <Link
          href="/admin/slides/new"
          className="bg-brand-yellow text-brand-black hover:bg-brand-yellow-dark inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-bold transition-colors"
        >
          <Plus aria-hidden className="size-4" />
          New banner
        </Link>
      </header>

      <div className="bg-card overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-semibold">Banner</th>
              <th scope="col" className="px-3 py-2 text-left font-semibold">Alt text (KA)</th>
              <th scope="col" className="px-3 py-2 text-left font-semibold">Links to</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Order</th>
              <th scope="col" className="px-3 py-2 text-left font-semibold">State</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {slides.map((slide) => (
              <tr key={slide.id} className="border-t">
                <td className="px-3 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={slide.image}
                    alt=""
                    className="bg-brand-black h-12 w-20 rounded object-contain"
                  />
                </td>
                <td className="max-w-72 px-3 py-2">{slide.alt.ka}</td>
                <td className="text-data text-muted-foreground px-3 py-2 text-xs">
                  {slide.href ?? "—"}
                </td>
                <td className="text-data px-3 py-2 text-right">{slide.order}</td>
                <td className="px-3 py-2">
                  {slide.isActive ? (
                    <Badge variant="secondary">active</Badge>
                  ) : (
                    <Badge variant="outline">hidden</Badge>
                  )}
                </td>
                <td className="px-3 py-2">
                  <SlideRowActions id={slide.id} label={slide.alt.ka} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-muted-foreground text-xs">
        Banners are shown lowest order first. Upload the images at{" "}
        <Link href="/admin/media" className="underline">
          Media library
        </Link>{" "}
        first, then pick one here.
      </p>
    </div>
  );
}
```

The thumbnail uses a plain `<img>` rather than `next/image` deliberately: it is a fixed 80×48 admin thumbnail, and routing it through the optimiser would generate a resized variant per asset for a page only admins see.

- [ ] **Step 5: Typecheck, lint and look**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

Then run `npm run dev`, sign in as an admin, open `http://localhost:3000/admin/slides`. Expected: "Homepage banners" in the left nav; an empty table with the explanatory footer. The "New banner" link 404s until Task 5 — that is expected at this commit.

If you cannot sign in, report the visual check as unverified rather than faking it.

- [ ] **Step 6: Commit**

```bash
git add lib/queries/admin.ts app/admin/layout.tsx app/admin/slides/page.tsx components/admin/slide-row-actions.tsx
git commit -m "feat: list homepage banners in the admin panel

The list shows inactive banners too, since the storefront hides them and the
panel is the only place they can be seen. The header states the fallback: with no
active banner the homepage keeps its original header."
```

---

### Task 5: The slide form and its pages

**Files:**
- Create: `components/admin/slide-form.tsx`, `app/admin/slides/new/page.tsx`, `app/admin/slides/[id]/page.tsx`

**Interfaces:**
- Consumes: `AdminSlideRow`, `getAdminSlide`, `getSlideFormOptions`, the POST/PATCH contract, `isCloudinaryImageUrl`, `isSiteRelativePath`.
- Produces: `<SlideForm slide={AdminSlideRow | undefined} options={{ media: ... }} />`.

- [ ] **Step 1: Write the form**

Create `components/admin/slide-form.tsx`:

```tsx
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
```

There is no delete button here — Task 4 put delete on the list row.

- [ ] **Step 2: Write the create page**

Create `app/admin/slides/new/page.tsx`:

```tsx
import Link from "next/link";

import { SlideForm } from "@/components/admin/slide-form";
import { getSlideFormOptions } from "@/lib/queries/admin";

export default async function NewSlidePage() {
  const options = await getSlideFormOptions();

  return (
    <div className="flex flex-col gap-5">
      <header>
        <Link href="/admin/slides" className="text-muted-foreground text-sm hover:underline">
          ← Homepage banners
        </Link>
        <h1 className="text-display mt-1 text-2xl">New banner</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          One image is shown to every language. Georgian alt text is required.
        </p>
      </header>

      <SlideForm options={options} />
    </div>
  );
}
```

- [ ] **Step 3: Write the edit page**

Create `app/admin/slides/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";

import { SlideForm } from "@/components/admin/slide-form";
import { getAdminSlide, getSlideFormOptions } from "@/lib/queries/admin";

export default async function EditSlidePage({ params }: PageProps<"/admin/slides/[id]">) {
  const { id } = await params;

  const [slide, options] = await Promise.all([getAdminSlide(id), getSlideFormOptions()]);
  if (!slide) notFound();

  return (
    <div className="flex flex-col gap-5">
      <header>
        <Link href="/admin/slides" className="text-muted-foreground text-sm hover:underline">
          ← Homepage banners
        </Link>
        <h1 className="text-display mt-1 text-2xl">Edit banner</h1>
        <p className="text-muted-foreground mt-1 text-sm">{slide.alt.ka}</p>
      </header>

      <SlideForm slide={slide} options={options} />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Create a banner through the UI**

With `npm run dev` running and signed in as an admin: upload one image at `/admin/media` if the library is empty, then create a banner at `/admin/slides/new`, confirm it appears in the list, edit its order, and delete it from the row. Then create one and leave it in place for Task 7's check.

If you cannot sign in, say so plainly and report this step unverified.

- [ ] **Step 6: Commit**

```bash
git add components/admin/slide-form.tsx app/admin/slides/new app/admin/slides/\[id\]
git commit -m "feat: create and edit homepage banners

The image is picked from the media library rather than uploaded here: uploading
already lives at /admin/media, and picking is what supplies the intrinsic width
and height that keep the homepage from reflowing as the banner loads.

The form mirrors the server's host and link rules so the operator is told before
a round trip, and the alt field explains why it matters — the banner's words are
inside the picture."
```

---

### Task 6: The carousel component

**Files:**
- Create: `components/home/hero-carousel.tsx`
- Modify: `messages/ka.json`, `messages/en.json`, `messages/ru.json`

**Interfaces:**
- Consumes: `HeroSlide` from `lib/types.ts`, `pickLocale` from `lib/localized.ts`.
- Produces: `<HeroCarousel slides={HeroSlide[]} locale={Locale} />`.

- [ ] **Step 1: Add the message keys**

In each of the three message files, inside the existing `"home"` object, after `"heroSecondaryCta"`. English (`messages/en.json`):

```json
    "promotions": "Promotions",
    "prevSlide": "Previous banner",
    "nextSlide": "Next banner",
    "goToSlide": "Go to banner {n}",
```

Georgian (`messages/ka.json`):

```json
    "promotions": "აქციები",
    "prevSlide": "წინა ბანერი",
    "nextSlide": "შემდეგი ბანერი",
    "goToSlide": "ბანერი {n}",
```

Russian (`messages/ru.json`):

```json
    "promotions": "Акции",
    "prevSlide": "Предыдущий баннер",
    "nextSlide": "Следующий баннер",
    "goToSlide": "Баннер {n}",
```

`{n}` is an ICU argument; next-intl fills it with `t("home.goToSlide", { n: index + 1 })`.

- [ ] **Step 2: Write the carousel**

Create `components/home/hero-carousel.tsx`:

```tsx
"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { Link } from "@/i18n/navigation";
import { pickLocale } from "@/lib/localized";
import type { HeroSlide, Locale } from "@/lib/types";
import { cn } from "@/lib/utils";

const AUTOPLAY_MS = 6000;

/**
 * The homepage banners.
 *
 * Built on native scroll-snap rather than a slider library: swipe, trackpad
 * flick and keyboard scrolling then come from the browser, and if this component
 * never hydrates the markup is still a scrollable strip of images rather than an
 * empty box. The arrows, the dots and autoplay all drive the same `scrollBy`.
 *
 * Nothing is cropped. The artwork carries its message inside the picture with
 * text close to the edges, so each image is contained on a brand-black backdrop
 * and only the letterboxing changes with the viewport.
 */
export function HeroCarousel({ slides, locale }: { slides: HeroSlide[]; locale: Locale }) {
  const t = useTranslations();
  const trackRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  const scrollToIndex = useCallback((index: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: track.clientWidth * index, behavior: "smooth" });
  }, []);

  // Which slide is showing, decided by what the browser actually scrolled to
  // rather than by a counter this component keeps — a swipe moves the track
  // without going through any of our handlers.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const index = Number((entry.target as HTMLElement).dataset.index);
            if (!Number.isNaN(index)) setCurrent(index);
          }
        }
      },
      { root: track, threshold: 0.6 },
    );

    for (const child of Array.from(track.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [slides.length]);

  useEffect(() => {
    if (slides.length < 2 || paused) return;
    // Honouring the OS setting is not decoration: motion that starts on its own
    // is exactly what this preference exists to stop.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = window.setInterval(() => {
      const track = trackRef.current;
      if (!track || document.hidden) return;
      const next = (current + 1) % slides.length;
      track.scrollTo({ left: track.clientWidth * next, behavior: "smooth" });
    }, AUTOPLAY_MS);

    return () => window.clearInterval(timer);
  }, [current, paused, slides.length]);

  if (!slides.length) return null;

  const many = slides.length > 1;

  return (
    <section
      aria-roledescription="carousel"
      aria-label={t("home.promotions")}
      className="bg-brand-black relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide, index) => {
          const alt = pickLocale(slide.alt, locale);
          const image = (
            <Image
              src={slide.image}
              alt={alt}
              width={slide.width ?? 1600}
              height={slide.height ?? 900}
              sizes="100vw"
              priority={index === 0}
              className="h-full w-full object-contain"
            />
          );

          return (
            <div
              key={slide.id}
              data-index={index}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} / ${slides.length}`}
              className="aspect-[4/3] w-full shrink-0 snap-center sm:aspect-[16/9]"
            >
              {slide.href ? (
                <Link href={slide.href} className="block h-full w-full">
                  {image}
                </Link>
              ) : (
                image
              )}
            </div>
          );
        })}
      </div>

      {many ? (
        <>
          <button
            type="button"
            aria-label={t("home.prevSlide")}
            onClick={() => scrollToIndex((current - 1 + slides.length) % slides.length)}
            className="absolute top-1/2 left-2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-black transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none sm:flex"
          >
            <ChevronLeft aria-hidden className="size-5" />
          </button>
          <button
            type="button"
            aria-label={t("home.nextSlide")}
            onClick={() => scrollToIndex((current + 1) % slides.length)}
            className="absolute top-1/2 right-2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-black transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none sm:flex"
          >
            <ChevronRight aria-hidden className="size-5" />
          </button>

          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
            {slides.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                aria-label={t("home.goToSlide", { n: index + 1 })}
                aria-current={index === current ? "true" : undefined}
                onClick={() => scrollToIndex(index)}
                className={cn(
                  "h-2 rounded-full transition-all focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none",
                  index === current ? "bg-brand-yellow w-6" : "w-2 bg-white/60 hover:bg-white",
                )}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. A missing message key does not fail typecheck — Task 7's browser pass is what catches that.

- [ ] **Step 4: Commit**

```bash
git add components/home/hero-carousel.tsx messages/ka.json messages/en.json messages/ru.json
git commit -m "feat: homepage banner carousel

Native scroll-snap rather than a slider library, so swipe and keyboard scrolling
come from the browser and the markup degrades to a scrollable strip of images if
the component never hydrates. Arrows, dots and autoplay all drive the same
scrollBy.

Which slide is current is read from what the browser actually scrolled to, not
from a counter — a swipe moves the track without passing through any handler.
Autoplay stops on hover, on focus, on a hidden tab, and never starts when the
visitor has asked for reduced motion."
```

---

### Task 7: Homepage integration

**Files:**
- Modify: `app/[locale]/page.tsx`

**Interfaces:**
- Consumes: `getHeroSlides`, `<HeroCarousel />`.
- Produces: nothing further.

- [ ] **Step 1: Read the slides**

In `app/[locale]/page.tsx`, add the import:

```ts
import { HeroCarousel } from "@/components/home/hero-carousel";
import { getHeroSlides } from "@/lib/queries/slides";
```

and add the read to the existing `Promise.all` (line 32), keeping the destructuring order aligned:

```ts
  const [roots, featured, onSale, brands, counts, slides] = await Promise.all([
    getRootCategories(),
    getFeaturedProducts(8),
    getSaleProducts(4),
    getAllBrands(),
    countProductsPerCategory(),
    getHeroSlides(),
  ]);
```

Note that `getSpecSchemaLookup()` has been dropped from the list — Step 3 removes its only consumer.

- [ ] **Step 2: Render the carousel or the original hero**

Wrap the existing hero `<section>` so it renders only when there are no slides. The whole block from `<section className="bg-card relative overflow-hidden">` to its closing `</section>` stays exactly as it is — do not retype it; wrap it:

```tsx
      {slides.length ? (
        <HeroCarousel slides={slides} locale={typedLocale} />
      ) : (
        <section className="bg-card relative overflow-hidden">
          {/* …unchanged… */}
        </section>
      )}
```

The fallback is what makes this reversible without a deploy: deactivating every banner brings the original hero back.

- [ ] **Step 3: Remove what only the hero used**

Delete these two lines (currently 40-41):

```ts
  const hero = featured[0];
  const heroSpecs = hero ? getCardSpecs(hero, typedLocale, specLabels, specSchema) : [];
```

`featured` is still used by the products grid further down (line 157) and stays. `specLabels` (line 29) and the `getSpecSchemaLookup()` read exist only for `heroSpecs` — remove both, along with any import left unused: `getCardSpecs`, `getSpecSchemaLookup`, `SpecStrip`, `PriceBlock`, and `BrandLogo`/`Image` if nothing else on the page uses them.

Do not guess which imports are dead. Run `npm run lint` and let it name them — the config reports unused imports as errors.

- [ ] **Step 4: Typecheck, lint and build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: no errors. The build is the gate that proves the page still renders with the hero block wrapped.

- [ ] **Step 5: Check both states in the browser**

With `npm run dev` running:

- With no active banner (or none created), `http://localhost:3000/ka` shows the original hero exactly as before.
- With at least one active banner, the carousel replaces it: the banner is visible without scrolling, and the page below — categories, featured products, brands — is unchanged.

Then untick Active on every banner and confirm the original hero returns without a restart.

- [ ] **Step 6: Commit**

```bash
git add app/[locale]/page.tsx
git commit -m "feat: show the banner carousel on the homepage

The carousel replaces the hero only when a banner exists; with none active the
original hero renders unchanged, which is what makes the change reversible from
the admin panel rather than by deploying.

The hero's featured-product card is gone, so the spec-schema lookup it needed
comes out of the page's reads rather than being computed and discarded."
```

---

### Task 8: Verification pass

**Files:**
- Modify: `scripts/verify-slides.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: no new exports.

- [ ] **Step 1: Lock in the fallback contract**

The homepage's fallback depends on `getHeroSlides()` returning an empty array rather than throwing when the collection is empty — not merely when every slide is inactive. Append inside the `try` block of `scripts/verify-slides.ts`:

```ts
    await cleanup();
    const afterCleanup = await (await import("../lib/queries/slides")).getHeroSlides();
    check(
      "an empty collection yields an array, not a throw",
      Array.isArray(afterCleanup),
    );
```

This runs after the fixtures are removed, so it exercises the real empty path. The `finally` still calls `cleanup()` again, which is harmless.

- [ ] **Step 2: Run the script twice**

Run: `NODE_OPTIONS="--require <scratchpad>/dns-fix.cjs" npm run verify:slides`
Expected: `20 checks passed`. Run it a second time — a clean second run proves the cleanup worked.

- [ ] **Step 3: Browser pass**

With `npm run dev` running, at least two active banners of different shapes (one square, one wide), and signed in as an admin where noted. Record each result:

1. The carousel replaces the hero; the first banner is visible without scrolling.
2. A square banner and a wide banner each appear whole, letterboxed on black, with no text cut off at any window width.
3. Swipe advances on a narrow window; the arrows and dots work with a mouse.
4. Tab into the carousel: arrows and dots are reachable and operable by keyboard, and the current dot is marked.
5. Autoplay advances roughly every six seconds and stops while the pointer is over the carousel.
6. With "reduce motion" enabled in the OS, autoplay never starts. On Windows this is Settings → Accessibility → Visual effects → Animation effects.
7. A banner with a link navigates to it; a banner without one is not a link.
8. Deactivate all but one banner: the arrows and dots disappear and autoplay stops.
9. Deactivate every banner: the original hero returns.
10. All three locales render the carousel, and the page does not shift as the banners load.
11. In the admin, a banner whose image URL is edited to a non-Cloudinary host is refused with the host message.
12. A banner whose link is set to `https://example.com` is refused; `/c/automatic-systems` is accepted.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-slides.ts
git commit -m "test: cover the empty-collection path the homepage depends on

The fallback to the original hero rests on getHeroSlides returning an empty array
for an empty collection, not only for a collection where everything is inactive."
```

---

## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| `HeroSlide` model, `width`/`height` copied from the asset | 1 |
| `getHeroSlides()`, active-only, ordered | 1 |
| Empty case renders the original hero | 7 (render), 1 and 8 (query contract) |
| Cloudinary host rule, site-relative `href` rule | 2 (rules), 3 (enforcement), 5 (messages) |
| `alt.ka` required | 3 (`localizedRequired`), 5 (form) |
| Scroll-snap mechanism, arrows, dots, autoplay | 6 |
| Contain on brand-black, 4:3 / 16:9 band | 6 |
| Reduced motion, hover/focus/hidden-tab pause | 6 |
| Single slide renders bare | 6 |
| Accessibility: roledescription, N of M, `aria-current` | 6 |
| First slide `priority`, rest lazy | 6 |
| `/admin/slides` list, new, edit, row delete | 4, 5 |
| Image picked from the media library | 4 (`getSlideFormOptions`), 5 (picker) |
| API handlers, guards, unguarded delete | 3 |
| Dead hero reads removed | 7 |
| Spec test items 1-7 | 1, 2, 8 |
| Spec test items 8-16 | 8 (browser pass) |

**Type consistency**

`HeroSlide` is defined once in Task 1 and consumed unchanged in Tasks 6 and 7. `AdminSlideRow` is defined in Task 4 and consumed in Task 5. `getSlideFormOptions` returns `{ media: [...] }` in Task 4 and is destructured as `options.media` in Task 5. The field codes `image_host` and `href_not_relative` are emitted in Task 3 and rendered by `messageFor` in Task 5. `toHeroSlide` is named consistently in Tasks 1 and 4.

**Known judgement calls left to the implementer**

Task 1 Step 5 carries a documented fallback if React's `cache()` memo defeats the script's second read. Task 2 Step 2 says what to do if the local `CLOUDINARY_CLOUD_NAME` is not `hva1f8dq` — change the fixture URLs, not the function. Task 7 Step 3 deliberately delegates "which imports are now unused" to lint rather than listing them from a stale reading of the file.

**One thing this plan does not do**

It does not upload the banners. They must be added at `/admin/media` by the operator; the slide form picks from what is there. Tasks 5 and 8 both need at least one image in the library to be verifiable.
