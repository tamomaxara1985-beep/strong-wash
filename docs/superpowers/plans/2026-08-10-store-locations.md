# Store Locations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the site carry several branches, each with its own phone, address, hours, email and map link, managed at `/admin/locations` and shown in the footer and on a new `/locations` page.

**Architecture:** A `StoreLocation` collection shaped like `Brand`, read by a `cache()`-wrapped query. The primary location — the one the header, mobile nav and product pages show — is simply the first active one in sort order. With nothing stored, every consumer falls back to a `DEFAULT_LOCATION` built from the constants that live in `DEFAULT_SETTINGS` today, so the site is unchanged until a real branch is added and no migration is needed. The four contact fields then leave `SiteSettings`.

**Tech Stack:** Next.js 16 (App Router, `PageProps`/`RouteContext` typed helpers), React 19, Mongoose 9, Zod, Tailwind v4, next-intl (storefront only), lucide-react.

**Spec:** `docs/superpowers/specs/2026-08-10-store-locations-design.md`

## Global Constraints

- **Read the Next.js docs first.** `AGENTS.md` requires it — this version has breaking changes versus training data. Guides are in `node_modules/next/dist/docs/`. `RouteContext<"/api/admin/locations/[id]">` and `PageProps<"/admin/locations/[id]">` are globals and `params` is always a Promise. Copy shapes from `app/api/admin/slides/[id]/route.ts` and `app/admin/slides/[id]/page.tsx`.
- **The admin tree is unlocalised, English-only.** No `next-intl` imports in `/admin` pages or components. The storefront IS localised and uses `useTranslations`/`getTranslations` and the localised `Link` from `@/i18n/navigation`.
- **Every admin API handler runs `assertSameOrigin(request)` then `requireAdmin()`, in that order, before anything else** — both from `@/lib/auth/guard`.
- **Error shapes come from `@/lib/api`:** `validationError({field: code})`, `notFoundJson("location")`, `apiError(error)` in every catch.
- **The type is `StoreLocation`, never `Location`.** `Location` is a global DOM type in TypeScript; a same-named export would shadow it and produce baffling errors in any file that touches both.
- **`name`, `address` and `workHours` are localized with `ka` required**; `phone` is a single string, like a brand name. `email` and `mapUrl` are optional.
- **`mapUrl` is the one deliberately external link on this site.** It must be `https:` and its host must be one of `google.com`, `www.google.com`, `maps.google.com`, `goo.gl`, `maps.app.goo.gl`. Rendered with `rel="noopener noreferrer"`.
- **Deleting the last location is refused.** With none stored every consumer falls back to `DEFAULT_LOCATION`, so deleting the only branch would silently restore the old hardcoded address as if nothing had happened.
- **The footer lists up to three branches in full**; at four or more it shows the first three and an "All locations →" link.
- **No test runner exists in this repo and adding one is forbidden.** Verification is `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run verify:locations` (created in Task 1), and a browser pass.
- **DB scripts need the DNS shim in this environment**, outside the repo and never worked around in a repo file: `--require <scratchpad>/dns-fix.cjs`. The controller supplies the full path.
- **Commit after every task.** Conventional Commits, English prose.

---

## File Structure

**Create:**
- `lib/models/store-location.ts` — the model.
- `lib/locations/defaults.ts` — `DEFAULT_LOCATION`, the single built-in branch.
- `lib/locations/validate.ts` — the map-URL rule. Pure, shared by the API and the client form.
- `lib/queries/locations.ts` — `getLocations()` and `getPrimaryLocation()`.
- `app/api/admin/locations/route.ts` — POST.
- `app/api/admin/locations/[id]/route.ts` — PATCH, DELETE.
- `app/admin/locations/page.tsx`, `new/page.tsx`, `[id]/page.tsx` — the admin section.
- `components/admin/location-form.tsx`, `components/admin/location-row-actions.tsx`.
- `components/layout/footer-locations.tsx` — the footer's contact list.
- `app/[locale]/locations/page.tsx` — the public page.
- `scripts/verify-locations.ts`.

**Modify:**
- `lib/types.ts` — the `StoreLocation` read type.
- `lib/queries/map.ts` — `toStoreLocation`.
- `lib/auth/schemas.ts` — `locationSchema`; later, four fields out of `settingsSchema`.
- `lib/queries/admin.ts` — `listAdminLocations`, `getAdminLocation`.
- `app/admin/layout.tsx` — nav entry.
- `app/[locale]/layout.tsx` — read locations, pass to header and footer.
- `components/layout/site-header.tsx`, `components/layout/site-footer.tsx`, `app/[locale]/p/[slug]/page.tsx` — read the primary location.
- `messages/{ka,en,ru}.json` — locations page and footer strings.
- `lib/settings/defaults.ts`, `lib/queries/settings.ts`, `components/admin/settings-form.tsx`, `app/admin/settings/page.tsx` — drop the four contact fields (Task 7).
- `package.json` — `verify:locations`.

---

### Task 1: Model, type, mapper, query, defaults, verification harness

**Files:**
- Create: `lib/models/store-location.ts`, `lib/locations/defaults.ts`, `lib/queries/locations.ts`, `scripts/verify-locations.ts`
- Modify: `lib/types.ts`, `lib/queries/map.ts`, `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `StoreLocation` model and `StoreLocationDocument` from `lib/models/store-location.ts`
  - `type StoreLocation = { id: string; name: LocalizedString; phone: string; email?: string; address: LocalizedString; workHours: LocalizedString; mapUrl?: string; order: number; isActive: boolean }` in `lib/types.ts`
  - `toStoreLocation(doc)` in `lib/queries/map.ts`
  - `DEFAULT_LOCATION: StoreLocation` from `lib/locations/defaults.ts`
  - `getLocations(): Promise<StoreLocation[]>` and `getPrimaryLocation(): Promise<StoreLocation>` from `lib/queries/locations.ts`
  - `npm run verify:locations`

- [ ] **Step 1: Write the model**

Create `lib/models/store-location.ts`:

```ts
import { type InferSchemaType, type Model, Schema, model, models } from "mongoose";

import { localizedStringSchema } from "./shared";

/**
 * One branch: somewhere a customer can walk into, with its own number.
 *
 * `phone` is a single string for the same reason a brand name is — a telephone
 * number is not translated. `name`, `address` and `workHours` are localized
 * because each genuinely reads differently per language.
 *
 * The model is called StoreLocation rather than Location because `Location` is a
 * global DOM type in TypeScript, and a same-named export shadows it in every file
 * that touches both.
 */
const storeLocationSchema = new Schema(
  {
    name: { type: localizedStringSchema, required: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: localizedStringSchema, required: true },
    workHours: { type: localizedStringSchema, required: true },
    /** Google Maps only; the one link on this site that deliberately leaves it. */
    mapUrl: { type: String, trim: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

storeLocationSchema.index({ isActive: 1, order: 1 });

export type StoreLocationDocument = InferSchemaType<typeof storeLocationSchema>;

/**
 * `models.StoreLocation ??` is not optional: dev hot reload re-runs this module
 * against a connection that already has the model compiled, and a second
 * `model()` call throws OverwriteModelError.
 */
export const StoreLocation: Model<StoreLocationDocument> =
  (models.StoreLocation as Model<StoreLocationDocument>) ??
  model<StoreLocationDocument>("StoreLocation", storeLocationSchema);
```

- [ ] **Step 2: Add the read type**

In `lib/types.ts`, after the `HeroSlide` type:

```ts
export type StoreLocation = {
  id: string;
  name: LocalizedString;
  phone: string;
  email?: string;
  address: LocalizedString;
  workHours: LocalizedString;
  mapUrl?: string;
  order: number;
  isActive: boolean;
};
```

- [ ] **Step 3: Add the mapper**

In `lib/queries/map.ts`, after `toHeroSlide`. The file already has `idToString`, a private `localized()` helper and a `LeanLocalized` type — reuse them.

```ts
type LeanStoreLocation = {
  _id: Id;
  name?: LeanLocalized;
  phone: string;
  email?: string | null;
  address?: LeanLocalized;
  workHours?: LeanLocalized;
  mapUrl?: string | null;
  order?: number;
  isActive?: boolean;
};

export function toStoreLocation(doc: LeanStoreLocation): StoreLocation {
  return {
    id: idToString(doc._id),
    name: localized(doc.name),
    phone: doc.phone,
    email: doc.email?.trim() || undefined,
    address: localized(doc.address),
    workHours: localized(doc.workHours),
    mapUrl: doc.mapUrl?.trim() || undefined,
    order: doc.order ?? 0,
    isActive: doc.isActive ?? true,
  };
}
```

Add `StoreLocation` to the existing `import type { ... } from "../types"` line rather than adding a second import statement.

- [ ] **Step 4: Write the default branch**

Create `lib/locations/defaults.ts`. The values are copied from `DEFAULT_SETTINGS` in `lib/settings/defaults.ts`, which is where they live until Task 7 removes them — read that file and copy them verbatim rather than retyping the Georgian.

```ts
import type { StoreLocation } from "../types";

/**
 * The one branch the site shows when nothing is stored.
 *
 * Same role `DEFAULT_SETTINGS` plays for the theme: a first deploy, an empty
 * collection or an unreachable Atlas must degrade to the site as it shipped, not
 * to a page with no telephone number on it. It is also why this feature needs no
 * migration — the values being "moved" out of settings were always constants.
 *
 * `id` is a sentinel, not an ObjectId: nothing may try to edit or delete this.
 */
export const DEFAULT_LOCATION: StoreLocation = {
  id: "default",
  name: {
    ka: "თბილისი",
    en: "Tbilisi",
    ru: "Тбилиси",
  },
  phone: "+995 322 40 40 40",
  email: "",
  address: {
    ka: "თბილისი, ქ. წერეთლის გამზ. 116",
    en: "116 Ts. Tsereteli Ave, Tbilisi",
    ru: "Тбилиси, пр. Ц. Церетели 116",
  },
  workHours: {
    ka: "ორშ–შაბ 10:00–18:00",
    en: "Mon–Sat 10:00–18:00",
    ru: "Пн–Сб 10:00–18:00",
  },
  order: 0,
  isActive: true,
};
```

Before writing it, run `grep -n "address\|workHours\|phone" lib/settings/defaults.ts` and confirm the strings match character for character. If they have diverged, `lib/settings/defaults.ts` wins.

- [ ] **Step 5: Write the queries**

Create `lib/queries/locations.ts`:

```ts
import { cache } from "react";

import { connectToDatabase } from "../db";
import { DEFAULT_LOCATION } from "../locations/defaults";
import { StoreLocation as StoreLocationModel } from "../models/store-location";
import type { StoreLocation } from "../types";
import { toStoreLocation } from "./map";

/**
 * The active branches, in display order.
 *
 * Never empty and never throws: with nothing stored — or with the database
 * unreachable — it returns the single default branch. These are read in the root
 * layout, so they sit on the path of every page, and a site that renders without
 * a telephone number is worse than one showing the address it shipped with.
 */
export const getLocations = cache(async (): Promise<StoreLocation[]> => {
  try {
    await connectToDatabase();
    const docs = await StoreLocationModel.find({ isActive: true }).sort({ order: 1 }).lean();
    if (!docs.length) return [DEFAULT_LOCATION];
    return docs.map(toStoreLocation);
  } catch (error) {
    console.error("[locations] falling back to the default branch", error);
    return [DEFAULT_LOCATION];
  }
});

/**
 * The branch whose number the header, the mobile nav and every product page show.
 *
 * It is the first in sort order — deliberately not a stored `isPrimary` flag,
 * which can be set on two rows or on none, leaving something else to decide
 * anyway. Order already answers it and is reorderable.
 */
export const getPrimaryLocation = cache(async (): Promise<StoreLocation> => {
  const locations = await getLocations();
  return locations[0] ?? DEFAULT_LOCATION;
});
```

- [ ] **Step 6: Write the verification script**

Create `scripts/verify-locations.ts`, modelled on `scripts/verify-slides.ts` — same `check()` helper, same marker-and-cleanup discipline. Locations have no slug, so fixtures are identified by a marker inside `name.ka`.

```ts
/**
 * DB-level checks for store locations.
 *
 * Run with `npm run verify:locations`. Every fixture carries the marker below in
 * `name.ka` and is removed in the `finally`, including when an assertion throws.
 * It writes to whatever MONGODB_URI points at, exactly like the seed script.
 */
import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";

import { StoreLocation } from "../lib/models/store-location";

loadEnvConfig(process.cwd());

const MARKER = "zzz-verify-location";
let passed = 0;

function check(label: string, condition: boolean) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  passed += 1;
  console.log(`  ok  ${label}`);
}

async function cleanup() {
  await StoreLocation.deleteMany({ "name.ka": { $regex: MARKER } });
}

function fixture(suffix: string, order: number, isActive = true) {
  return {
    name: { ka: `${MARKER} ${suffix}` },
    phone: "+995 000 00 00 00",
    address: { ka: `მისამართი ${suffix}` },
    workHours: { ka: "ორშ–შაბ 10:00–18:00" },
    order,
    isActive,
  };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);

  try {
    await cleanup();

    const { getLocations, getPrimaryLocation } = await import("../lib/queries/locations");
    const { DEFAULT_LOCATION } = await import("../lib/locations/defaults");

    const empty = await getLocations();
    check("with nothing stored the list is the default branch", empty.length === 1);
    check("and it is DEFAULT_LOCATION", empty[0]?.id === DEFAULT_LOCATION.id);

    await StoreLocation.create(fixture("second", 20));
    await StoreLocation.create(fixture("first", 10));
    await StoreLocation.create(fixture("hidden", 5, false));

    const stored = (await import("../lib/queries/locations")).getLocations;
    const list = (await stored()).filter((l) => l.name.ka.includes(MARKER));

    check("stored branches replace the default", list.length === 2);
    check("they come back in order", list[0]?.name.ka.endsWith("first") === true);
    check("an inactive branch is absent", !list.some((l) => l.name.ka.endsWith("hidden")));

    const primary = await (await import("../lib/queries/locations")).getPrimaryLocation();
    check("the primary is the first by order", primary.name.ka.endsWith("first"));

    await StoreLocation.updateOne(
      { "name.ka": `${MARKER} second` },
      { $set: { order: 1 } },
    );
    const reordered = await (await import("../lib/queries/locations")).getPrimaryLocation();
    check("reordering changes which is primary", reordered.name.ka.endsWith("second"));

    check("an unset en stays unset, for pickLocale to resolve", list[0]?.name.en === undefined);
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

Note on the repeated `await import(...)`: `getLocations` and `getPrimaryLocation` are `cache()`-wrapped. Outside Next's RSC bundler React's `cache()` is a pass-through, so each call genuinely re-reads — that is what the ordering and primary checks depend on. If a check nevertheless sees a stale result, replace that call with a direct `StoreLocationModel.find({ isActive: true }).sort({ order: 1 })` and assert on it, and say so in your report. Do not delete the check.

- [ ] **Step 7: Register the script**

In `package.json`, after `"verify:slides"`:

```json
    "verify:locations": "tsx scripts/verify-locations.ts",
```

- [ ] **Step 8: Run it**

Run: `NODE_OPTIONS="--require <scratchpad>/dns-fix.cjs" npm run verify:locations`
Expected: eight `ok` lines then `8 checks passed`. Run it a second time — a clean second run proves the cleanup worked.

- [ ] **Step 9: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. If tsc reports errors inside `.next/dev/types/`, that is a corrupted gitignored artifact from a running dev server: delete `.next/dev/types`, run `npx next typegen`, re-run.

- [ ] **Step 10: Commit**

```bash
git add lib/models/store-location.ts lib/locations/defaults.ts lib/queries/locations.ts lib/types.ts lib/queries/map.ts scripts/verify-locations.ts package.json
git commit -m "feat: read store locations, with one built-in branch as the floor

A branch carries its own phone, address, hours, optional email and optional map
link. The list is never empty: with nothing stored it is the single default
branch, which is why this needs no migration — the values it holds were always
constants rather than data.

The primary branch, whose number the header and product pages show, is the first
in sort order. Not a stored flag: a flag can be set on two rows or none, and then
something still has to decide."
```

---

### Task 2: The map-URL rule

**Files:**
- Create: `lib/locations/validate.ts`
- Modify: `scripts/verify-locations.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `isMapUrl(value: string): boolean` and `MAP_HOSTS: string[]` from `lib/locations/validate.ts`.

- [ ] **Step 1: Write the module**

Create `lib/locations/validate.ts`. Pure and dependency-free: the route handler and the client form both import it, and a client component cannot pull in Mongoose.

```ts
/**
 * The one URL on this site that is supposed to leave it.
 *
 * Everywhere else a user-supplied link is forced to stay internal —
 * `isSiteRelativePath` in `lib/slides/validate.ts` exists precisely to stop a
 * banner becoming an off-site link. A branch's map link is the opposite, so it
 * gets its own narrow rule rather than a relaxation of that one.
 *
 * An allowlist rather than "any https URL" because this renders as a link on a
 * public page, and "paste a link here" is the shape of every open redirect that
 * ever shipped.
 */
export const MAP_HOSTS = [
  "google.com",
  "www.google.com",
  "maps.google.com",
  "goo.gl",
  "maps.app.goo.gl",
];

export function isMapUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  // Exact host match, never `endsWith`: google.com.evil.example ends with the
  // right string and is a different site.
  return url.protocol === "https:" && MAP_HOSTS.includes(url.hostname);
}
```

- [ ] **Step 2: Add checks**

In `scripts/verify-locations.ts`, inside the `try` block after the existing checks:

```ts
    const { isMapUrl } = await import("../lib/locations/validate");

    for (const good of [
      "https://maps.google.com/?q=41.7,44.8",
      "https://www.google.com/maps/place/Tbilisi",
      "https://goo.gl/maps/abc",
      "https://maps.app.goo.gl/abc",
    ]) {
      check(`the map rule accepts ${JSON.stringify(good)}`, isMapUrl(good));
    }

    for (const bad of [
      "http://maps.google.com/?q=1",
      "https://evil.example/maps",
      "https://google.com.evil.example/",
      "https://notgoogle.com/maps",
      "javascript:alert(1)",
      "maps.google.com",
      "",
    ]) {
      check(`the map rule refuses ${JSON.stringify(bad)}`, !isMapUrl(bad));
    }
```

`https://google.com.evil.example/` is the case that matters: a host check written with `endsWith` accepts it, and it is a different site. Confirm it comes back refused rather than assuming.

- [ ] **Step 3: Run the checks**

Run: `NODE_OPTIONS="--require <scratchpad>/dns-fix.cjs" npm run verify:locations`
Expected: `19 checks passed`.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/locations/validate.ts scripts/verify-locations.ts
git commit -m "feat: allowlist the hosts a branch's map link may point at

This is the only user-supplied URL on the site that is meant to leave it, so it
cannot reuse the rule that keeps banner links internal. An allowlist rather than
'any https URL', because the value renders as a link on a public page.

The host match is exact rather than a suffix test: google.com.evil.example ends
with the right string and is somebody else's site."
```

---

### Task 3: Schema and API

**Files:**
- Modify: `lib/auth/schemas.ts` (after `slideSchema`)
- Create: `app/api/admin/locations/route.ts`, `app/api/admin/locations/[id]/route.ts`

**Interfaces:**
- Consumes: `StoreLocation` model, `isMapUrl`.
- Produces the contract the form codes against:
  - `POST /api/admin/locations` → `201 { id }`
  - `PATCH /api/admin/locations/[id]` → `200 { id }`
  - `DELETE /api/admin/locations/[id]` → `200 { deleted }` or `409 { error: "last_location" }`
  - `422 { error: "validation_failed", fields: {...} }` with codes `required`, `map_host`

- [ ] **Step 1: Add the schema**

In `lib/auth/schemas.ts`, after `slideSchema`. `localizedRequired` already exists in this file and makes `ka` required — use it.

```ts
/**
 * `name`, `address` and `workHours` are `localizedRequired`: a branch a visitor
 * cannot name or find is not worth listing. `phone` is one string, as a telephone
 * number is not translated.
 *
 * The map-host rule is enforced in the route handler rather than here, so it can
 * report a field code the form explains.
 */
export const locationSchema = z.object({
  name: localizedRequired,
  phone: z.string().trim().min(3, "required").max(40),
  email: z.string().trim().toLowerCase().max(254).email().optional().or(z.literal("")),
  address: localizedRequired,
  workHours: localizedRequired,
  mapUrl: z.string().trim().max(500).optional().or(z.literal("")),
  order: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? 0 : value),
    z.coerce.number().int().min(0).max(9999),
  ),
  isActive: z.boolean().default(true),
});
```

- [ ] **Step 2: Write the create handler**

Create `app/api/admin/locations/route.ts`:

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, validationError } from "@/lib/api";
import { assertSameOrigin, requireAdmin } from "@/lib/auth/guard";
import { fieldErrors, locationSchema } from "@/lib/auth/schemas";
import { connectToDatabase } from "@/lib/db";
import { isMapUrl } from "@/lib/locations/validate";
import { StoreLocation } from "@/lib/models/store-location";

/** Creates a branch. */
export async function POST(request: NextRequest) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const parsed = locationSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(fieldErrors(parsed.error));

    const mapUrl = parsed.data.mapUrl?.trim();
    if (mapUrl && !isMapUrl(mapUrl)) return validationError({ mapUrl: "map_host" });

    await connectToDatabase();

    const doc = new StoreLocation({
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email || undefined,
      address: parsed.data.address,
      workHours: parsed.data.workHours,
      mapUrl: mapUrl || undefined,
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

Create `app/api/admin/locations/[id]/route.ts`:

```ts
import { Types } from "mongoose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, notFoundJson, validationError } from "@/lib/api";
import { assertSameOrigin, requireAdmin } from "@/lib/auth/guard";
import { fieldErrors, locationSchema } from "@/lib/auth/schemas";
import { connectToDatabase } from "@/lib/db";
import { isMapUrl } from "@/lib/locations/validate";
import { StoreLocation } from "@/lib/models/store-location";

/** Updates a branch. */
export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/admin/locations/[id]">,
) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) return notFoundJson("location");

    const parsed = locationSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(fieldErrors(parsed.error));

    const mapUrl = parsed.data.mapUrl?.trim();
    if (mapUrl && !isMapUrl(mapUrl)) return validationError({ mapUrl: "map_host" });

    await connectToDatabase();
    const location = await StoreLocation.findById(id);
    if (!location) return notFoundJson("location");

    location.name = parsed.data.name;
    location.phone = parsed.data.phone;
    location.email = parsed.data.email || undefined;
    location.address = parsed.data.address;
    location.workHours = parsed.data.workHours;
    location.mapUrl = mapUrl || undefined;
    location.order = parsed.data.order;
    location.isActive = parsed.data.isActive;
    await location.save();

    return NextResponse.json({ id: String(location._id) });
  } catch (error) {
    return apiError(error);
  }
}

/**
 * Deletes a branch, unless it is the only one.
 *
 * With none stored every consumer falls back to the built-in default, so deleting
 * the last branch would silently restore the address the site shipped with — no
 * error, no empty state, just the wrong telephone number back on every page. The
 * refusal names the alternative.
 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext<"/api/admin/locations/[id]">,
) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) return notFoundJson("location");

    await connectToDatabase();
    const location = await StoreLocation.findById(id).select("_id");
    if (!location) return notFoundJson("location");

    // Counts every branch, active or not: an inactive one is still a row the
    // operator can re-activate, so it is not the "last" one in the sense that
    // matters here.
    const total = await StoreLocation.countDocuments({});
    if (total <= 1) {
      return NextResponse.json({ error: "last_location" }, { status: 409 });
    }

    await location.deleteOne();
    return NextResponse.json({ deleted: id });
  } catch (error) {
    return apiError(error);
  }
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. If `RouteContext<"/api/admin/locations/[id]">` is reported as unknown, run `npx next typegen`, then re-run.

- [ ] **Step 5: Smoke-test the guard**

With `npm run dev` running:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/admin/locations \
  -H "Content-Type: application/json" -d '{"phone":"+995 1"}'
```

Expected: `401` — no session, so `requireAdmin` rejects before any write. (`403` is the signed-in-non-admin case; either is a pass.) Anything 2xx means a guard is missing.

- [ ] **Step 6: Commit**

```bash
git add lib/auth/schemas.ts app/api/admin/locations
git commit -m "feat: branch create, update and delete endpoints

Deleting the last branch is refused. With none stored every consumer falls back to
the built-in default, so it would silently restore the address the site shipped
with — no error, just the wrong number back on every page.

The count includes inactive branches: one that is merely hidden is still a row the
operator can bring back, so it is not the last in the sense that matters."
```

---

### Task 4: Admin reads, list page, row actions, nav

**Files:**
- Modify: `lib/queries/admin.ts`, `app/admin/layout.tsx`
- Create: `app/admin/locations/page.tsx`, `components/admin/location-row-actions.tsx`

**Interfaces:**
- Consumes: the `StoreLocation` model and the DELETE contract.
- Produces:
  - `type AdminLocationRow = { id: string; name: LocalizedString; phone: string; email?: string; address: LocalizedString; workHours: LocalizedString; mapUrl?: string; order: number; isActive: boolean }`
  - `listAdminLocations(): Promise<AdminLocationRow[]>`, `getAdminLocation(id: string): Promise<AdminLocationRow | null>`
  - `<LocationRowActions id={string} name={string} />`

- [ ] **Step 1: Add the admin reads**

In `lib/queries/admin.ts`, after the slide block. `Types`, `connectToDatabase` and `LocalizedString` are already imported — add only `StoreLocation` to the imports.

```ts
export type AdminLocationRow = {
  id: string;
  name: LocalizedString;
  phone: string;
  email?: string;
  address: LocalizedString;
  workHours: LocalizedString;
  mapUrl?: string;
  order: number;
  isActive: boolean;
};

/**
 * Every branch, inactive ones included: the storefront hides those, which is
 * exactly why the panel has to show them.
 */
export async function listAdminLocations(): Promise<AdminLocationRow[]> {
  await connectToDatabase();
  const docs = await StoreLocation.find({}).sort({ order: 1 }).lean();

  return docs.map((doc) => ({
    id: String(doc._id),
    name: {
      ka: doc.name?.ka ?? "",
      en: doc.name?.en ?? undefined,
      ru: doc.name?.ru ?? undefined,
    },
    phone: doc.phone,
    email: doc.email?.trim() || undefined,
    address: {
      ka: doc.address?.ka ?? "",
      en: doc.address?.en ?? undefined,
      ru: doc.address?.ru ?? undefined,
    },
    workHours: {
      ka: doc.workHours?.ka ?? "",
      en: doc.workHours?.en ?? undefined,
      ru: doc.workHours?.ru ?? undefined,
    },
    mapUrl: doc.mapUrl?.trim() || undefined,
    order: doc.order ?? 0,
    isActive: doc.isActive ?? true,
  }));
}

export async function getAdminLocation(id: string): Promise<AdminLocationRow | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  const all = await listAdminLocations();
  return all.find((row) => row.id === id) ?? null;
}
```

- [ ] **Step 2: Add the nav entry**

In `app/admin/layout.tsx`, add `MapPin` to the `lucide-react` import (keep the list alphabetical) and add to `NAV`, directly after the Site settings entry:

```ts
  { href: "/admin/locations", label: "Locations", icon: MapPin },
```

- [ ] **Step 3: Write the row actions**

Create `components/admin/location-row-actions.tsx`:

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
 * The server refuses to delete the only branch; this renders that refusal as the
 * thing to do instead, because "cannot delete" without an alternative is where an
 * operator gets stuck.
 */
export function LocationRowActions({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(`Delete "${name}"?\n\nThis cannot be undone.`)) return;

    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/locations/${id}`, { method: "DELETE" });
      if (response.ok) {
        router.refresh();
        return;
      }

      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (body.error === "last_location") {
        setError(
          "This is your only location, and the site needs one. Add another first, or untick “Active” to take it off the site instead.",
        );
      } else if (body.error === "forbidden" || body.error === "unauthenticated") {
        setError("Your session no longer has admin access. Sign in again.");
      } else {
        setError("Could not delete that location.");
      }
    } catch {
      setError("Could not delete that location.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex justify-end gap-1.5">
        <Link
          href={`/admin/locations/${id}`}
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
        <p role="alert" className="text-destructive max-w-72 text-right text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Write the list page**

Create `app/admin/locations/page.tsx`:

```tsx
import { Plus } from "lucide-react";
import Link from "next/link";

import { LocationRowActions } from "@/components/admin/location-row-actions";
import { Badge } from "@/components/ui/badge";
import { listAdminLocations } from "@/lib/queries/admin";

export default async function AdminLocationsPage() {
  const locations = await listAdminLocations();
  const active = locations.filter((location) => location.isActive).length;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display text-2xl">Locations</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {active} shown on the site, {locations.length} in total. The first by order is
            the one the header and product pages show.
          </p>
        </div>
        <Link
          href="/admin/locations/new"
          className="bg-brand-yellow text-brand-black hover:bg-brand-yellow-dark inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-bold transition-colors"
        >
          <Plus aria-hidden className="size-4" />
          New location
        </Link>
      </header>

      <div className="bg-card overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-semibold">Name</th>
              <th scope="col" className="px-3 py-2 text-left font-semibold">Phone</th>
              <th scope="col" className="px-3 py-2 text-left font-semibold">Address (KA)</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Order</th>
              <th scope="col" className="px-3 py-2 text-left font-semibold">State</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {locations.map((location, index) => (
              <tr key={location.id} className="border-t">
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/locations/${location.id}`}
                    className="font-medium hover:underline"
                  >
                    {location.name.en ?? location.name.ka}
                  </Link>
                  {index === 0 && location.isActive ? (
                    <span className="text-muted-foreground ml-2 text-xs">primary</span>
                  ) : null}
                </td>
                <td className="text-data px-3 py-2">{location.phone}</td>
                <td className="max-w-72 px-3 py-2">{location.address.ka}</td>
                <td className="text-data px-3 py-2 text-right">{location.order}</td>
                <td className="px-3 py-2">
                  {location.isActive ? (
                    <Badge variant="secondary">active</Badge>
                  ) : (
                    <Badge variant="outline">hidden</Badge>
                  )}
                </td>
                <td className="px-3 py-2">
                  <LocationRowActions
                    id={location.id}
                    name={location.name.en ?? location.name.ka}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-muted-foreground text-xs">
        Branches are listed lowest order first. The footer shows up to three in full and
        links to the locations page beyond that. With no location at all, the site falls
        back to a single built-in branch.
      </p>
    </div>
  );
}
```

The "primary" marker uses `index === 0 && location.isActive`, which is only correct because the list is sorted by `order` and the first row is therefore the first branch. If the first row is inactive the marker is suppressed rather than shown on the wrong row — the storefront's primary is the first *active* one, and marking a hidden row "primary" would be a lie.

- [ ] **Step 5: Typecheck, lint and look**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

Then `npm run dev`, sign in as an admin, open `http://localhost:3000/admin/locations`. Expected: "Locations" in the nav, an empty table, the explanatory footer. The "New location" link 404s until Task 5 — expected at this commit.

If you cannot sign in, report the visual check as unverified rather than faking it.

- [ ] **Step 6: Commit**

```bash
git add lib/queries/admin.ts app/admin/layout.tsx app/admin/locations/page.tsx components/admin/location-row-actions.tsx
git commit -m "feat: list store locations in the admin panel

The list shows inactive branches too, since the storefront hides them and the panel
is the only place they can be seen. The first active branch is marked primary,
because that is the one whose number the header and product pages carry."
```

---

### Task 5: The location form and its pages

**Files:**
- Create: `components/admin/location-form.tsx`, `app/admin/locations/new/page.tsx`, `app/admin/locations/[id]/page.tsx`

**Interfaces:**
- Consumes: `AdminLocationRow`, `getAdminLocation`, the POST/PATCH contract, `isMapUrl`, `MAP_HOSTS`.
- Produces: `<LocationForm location={AdminLocationRow | undefined} />`.

- [ ] **Step 1: Write the form**

Create `components/admin/location-form.tsx`:

```tsx
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
    default:
      return "Invalid.";
  }
}

/**
 * One form for creating and editing a branch.
 *
 * Name, address and hours are per-language; the phone is not, because a telephone
 * number is not translated.
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
            <p className="text-muted-foreground text-xs">Not translated — one number.</p>
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
```

There is no delete button here — Task 4 put delete on the list row.

- [ ] **Step 2: Write the create page**

Create `app/admin/locations/new/page.tsx`:

```tsx
import Link from "next/link";

import { LocationForm } from "@/components/admin/location-form";

export default function NewLocationPage() {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <Link href="/admin/locations" className="text-muted-foreground text-sm hover:underline">
          ← Locations
        </Link>
        <h1 className="text-display mt-1 text-2xl">New location</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Georgian is required; English and Russian fall back to it when empty.
        </p>
      </header>

      <LocationForm />
    </div>
  );
}
```

- [ ] **Step 3: Write the edit page**

Create `app/admin/locations/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";

import { LocationForm } from "@/components/admin/location-form";
import { getAdminLocation } from "@/lib/queries/admin";

export default async function EditLocationPage({ params }: PageProps<"/admin/locations/[id]">) {
  const { id } = await params;
  const location = await getAdminLocation(id);
  if (!location) notFound();

  return (
    <div className="flex flex-col gap-5">
      <header>
        <Link href="/admin/locations" className="text-muted-foreground text-sm hover:underline">
          ← Locations
        </Link>
        <h1 className="text-display mt-1 text-2xl">{location.name.en ?? location.name.ka}</h1>
        <p className="text-data text-muted-foreground mt-1 text-sm">{location.phone}</p>
      </header>

      <LocationForm location={location} />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Create a branch through the UI**

With `npm run dev` running and signed in: create a location, confirm it appears in the list marked primary, edit its order, try a map URL of `https://example.com/x` and confirm it is refused, then try deleting it and confirm the last-location refusal appears. Leave one location in place for Task 6.

If you cannot sign in, say so plainly and report this step unverified.

- [ ] **Step 6: Commit**

```bash
git add components/admin/location-form.tsx app/admin/locations/new app/admin/locations/\[id\]
git commit -m "feat: create and edit store locations

Name, address and hours are per-language; the phone is not, because a telephone
number is not translated. The map field mirrors the server's host rule as an inline
warning so the operator is told before a round trip."
```

---

### Task 6: The storefront

**Files:**
- Create: `components/layout/footer-locations.tsx`, `app/[locale]/locations/page.tsx`
- Modify: `messages/{ka,en,ru}.json`, `app/[locale]/layout.tsx`, `components/layout/site-header.tsx`, `components/layout/site-footer.tsx`, `app/[locale]/p/[slug]/page.tsx`

**Interfaces:**
- Consumes: `getLocations`, `getPrimaryLocation`, `StoreLocation`, `pickLocale`.
- Produces: `<FooterLocations locations={StoreLocation[]} locale={Locale} />`; `SiteHeader` and `SiteFooter` take `locations` in place of the contact half of `settings`.

- [ ] **Step 1: Add the message keys**

In each message file, inside the existing `"footer"` object, after `"workHours"`:

English (`messages/en.json`):

```json
    "allLocations": "All locations",
```

Georgian (`messages/ka.json`):

```json
    "allLocations": "ყველა ფილიალი",
```

Russian (`messages/ru.json`):

```json
    "allLocations": "Все филиалы",
```

Then add a new top-level `"locations"` object after `"footer"` in each file.

English:

```json
  "locations": {
    "title": "Our locations",
    "intro": "Come and see the equipment. Every branch carries the full range and can arrange delivery and installation.",
    "hours": "Opening hours",
    "directions": "Directions"
  },
```

Georgian:

```json
  "locations": {
    "title": "ჩვენი ფილიალები",
    "intro": "მობრძანდით და ნახეთ ტექნიკა ადგილზე. ყველა ფილიალში სრული ასორტიმენტია და ვუზრუნველყოფთ მიწოდებასა და მონტაჟს.",
    "hours": "სამუშაო საათები",
    "directions": "მარშრუტი"
  },
```

Russian:

```json
  "locations": {
    "title": "Наши филиалы",
    "intro": "Приезжайте и посмотрите оборудование вживую. В каждом филиале полный ассортимент, доставка и монтаж.",
    "hours": "Часы работы",
    "directions": "Маршрут"
  },
```

Validate each file parses afterwards: `node -e "JSON.parse(require('fs').readFileSync('messages/ka.json','utf8'))"` and the same for `en` and `ru`.

- [ ] **Step 2: Write the footer's location list**

Create `components/layout/footer-locations.tsx`:

```tsx
import { MapPin, Phone } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { pickLocale } from "@/lib/localized";
import type { Locale, StoreLocation } from "@/lib/types";

/**
 * Up to three branches in full, then a link.
 *
 * Three because that is how many branches there are: listing them all keeps every
 * number one glance away, and the link only appears once the column would
 * genuinely crowd.
 */
const FOOTER_LIMIT = 3;

export async function FooterLocations({
  locations,
  locale,
}: {
  locations: StoreLocation[];
  locale: Locale;
}) {
  const t = await getTranslations();
  const shown = locations.slice(0, FOOTER_LIMIT);
  const hasMore = locations.length > FOOTER_LIMIT;

  return (
    <ul className="mt-3 flex flex-col gap-4 text-sm">
      {shown.map((location) => (
        <li key={location.id} className="flex flex-col gap-1.5">
          {locations.length > 1 ? (
            <span className="text-white font-semibold">{pickLocale(location.name, locale)}</span>
          ) : null}
          <a
            href={`tel:${location.phone.replace(/\s/g, "")}`}
            className="text-data hover:text-white inline-flex items-center gap-2 font-semibold transition-colors"
          >
            <Phone aria-hidden className="size-4 shrink-0" />
            {location.phone}
          </a>
          <span className="inline-flex items-start gap-2">
            <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
            {pickLocale(location.address, locale)}
          </span>
        </li>
      ))}

      {hasMore ? (
        <li>
          <Link href="/locations" className="hover:text-white font-semibold transition-colors">
            {t("footer.allLocations")} →
          </Link>
        </li>
      ) : null}
    </ul>
  );
}
```

The branch name is suppressed when there is only one location: labelling a single address "Tbilisi" adds a line and tells the reader nothing.

- [ ] **Step 3: Rewire the footer**

In `components/layout/site-footer.tsx`:

- Add `locations: StoreLocation[]` to the props alongside `locale` and `settings`, and import `StoreLocation` from `@/lib/types` and `FooterLocations` from `@/components/layout/footer-locations`.
- Replace the whole `<ul className="mt-3 flex flex-col gap-2.5 text-sm"> … </ul>` inside the contact `<div>` — the phone, address, email and hours list items — with:

```tsx
          <FooterLocations locations={locations} locale={locale} />
```

- The email row moves into the locations page rather than the footer: with several branches, one email in a list of three addresses belongs to none of them. Remove the `Mail` import if nothing else in the file uses it; lint will say.
- Leave `settings` on the props for now — Task 7 removes it once the contact fields are gone.

- [ ] **Step 4: Rewire the header**

In `components/layout/site-header.tsx`:

- Add `primary: StoreLocation` to the props and import the type.
- Change the "Showroom" link's `href` from `/c/spare-parts` to `/locations`.
- Replace `settings.phone` with `primary.phone` in the utility-bar `tel:` href, its label, and the `phone` prop passed to `MobileNav`.

- [ ] **Step 5: Rewire the product page**

In `app/[locale]/p/[slug]/page.tsx`, replace the `getSiteSettings()` read with `getPrimaryLocation()` from `@/lib/queries/locations`, and the two `settings.phone` references with the primary location's phone. Remove the `getSiteSettings` import if nothing else in the file uses it.

- [ ] **Step 6: Read locations in the layout**

In `app/[locale]/layout.tsx`, import `getLocations` from `@/lib/queries/locations`, read it alongside the settings read, and pass the results down:

```tsx
  const [settings, locations] = await Promise.all([getSiteSettings(), getLocations()]);
```

```tsx
          <SiteHeader locale={locale as Locale} settings={settings} primary={locations[0]} />
          <main className="flex-1">{children}</main>
          <SiteFooter locale={locale as Locale} settings={settings} locations={locations} />
```

`locations[0]` is safe without a fallback: `getLocations()` never returns an empty array — with nothing stored it returns the single default branch, and it catches its own errors.

- [ ] **Step 7: Write the locations page**

Create `app/[locale]/locations/page.tsx`:

```tsx
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { SectionHeading } from "@/components/layout/section-heading";
import { pickLocale } from "@/lib/localized";
import { getLocations } from "@/lib/queries/locations";
import type { Locale } from "@/lib/types";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/locations">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "locations" });
  return { title: t("title"), description: t("intro") };
}

export default async function LocationsPage({ params }: PageProps<"/[locale]/locations">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations();
  const typedLocale = locale as Locale;
  const locations = await getLocations();

  return (
    <div className="container-page py-12">
      <SectionHeading title={t("locations.title")} />
      <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">
        {t("locations.intro")}
      </p>

      <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {locations.map((location) => (
          <li key={location.id} className="bg-card flex flex-col gap-3 rounded-xl border p-5">
            <h2 className="text-display text-lg">{pickLocale(location.name, typedLocale)}</h2>

            <p className="inline-flex items-start gap-2 text-sm">
              <MapPin aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              {pickLocale(location.address, typedLocale)}
            </p>

            <p className="text-muted-foreground inline-flex items-start gap-2 text-sm">
              <Clock aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="sr-only">{t("locations.hours")}: </span>
                {pickLocale(location.workHours, typedLocale)}
              </span>
            </p>

            <a
              href={`tel:${location.phone.replace(/\s/g, "")}`}
              className="text-data hover:text-primary inline-flex items-center gap-2 text-sm font-semibold transition-colors"
            >
              <Phone aria-hidden className="size-4 shrink-0" />
              {location.phone}
            </a>

            {location.email ? (
              <a
                href={`mailto:${location.email}`}
                className="hover:text-primary inline-flex items-center gap-2 text-sm transition-colors"
              >
                <Mail aria-hidden className="size-4 shrink-0" />
                {location.email}
              </a>
            ) : null}

            {location.mapUrl ? (
              <a
                href={location.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="border-foreground/20 hover:bg-secondary mt-1 inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-semibold transition-colors"
              >
                {t("locations.directions")} ↗
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 8: Typecheck, lint and build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: no errors. The build is the gate that proves every consumer was rewired — a missed `settings.phone` fails it.

- [ ] **Step 9: Look at all three locales**

With `npm run dev` running: `/ka`, `/en` and `/ru` each show the footer contact list and the header phone; `/ka/locations`, `/en/locations` and `/ru/locations` render the cards; the header's "Showroom" link reaches the locations page.

With no location stored, everything shows the single default branch and the footer suppresses the branch-name line.

- [ ] **Step 10: Commit**

```bash
git add messages components/layout/footer-locations.tsx components/layout/site-footer.tsx components/layout/site-header.tsx app/\[locale\]/layout.tsx app/\[locale\]/locations app/\[locale\]/p/\[slug\]/page.tsx
git commit -m "feat: show every branch in the footer and on a locations page

The header's Showroom link finally points somewhere real — it was aimed at the
spare-parts category, a placeholder nobody had replaced.

The footer lists up to three branches in full and links out beyond that, so it
cannot grow without bound. The branch name is suppressed when there is only one:
labelling a single address adds a line and tells the reader nothing.

The email row moves to the locations page. With several branches, one address in a
list of three belongs to none of them."
```

---

### Task 7: Contact details leave `SiteSettings`

**Files:**
- Modify: `lib/settings/defaults.ts`, `lib/queries/settings.ts`, `lib/auth/schemas.ts`, `components/admin/settings-form.tsx`, `app/admin/settings/page.tsx`, `components/layout/site-header.tsx`, `components/layout/site-footer.tsx`, `scripts/verify-settings.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ResolvedSettings` narrowed to `{ brandYellow: string; brandBlack: string; fontKey: string }`.

- [ ] **Step 1: Narrow the settings type and defaults**

In `lib/settings/defaults.ts`, remove `phone`, `email`, `address` and `workHours` from both `ResolvedSettings` and `DEFAULT_SETTINGS`, leaving the three theme fields. Add a line to the docblock:

```ts
/**
 * …
 *
 * Contact details used to live here. They moved to `lib/locations/defaults.ts`
 * when the site gained several branches — a single phone and address could not
 * describe more than one.
 */
```

- [ ] **Step 2: Narrow the query**

In `lib/queries/settings.ts`, remove the four fields from the returned object. `mergeLocalized` becomes unused once `address` and `workHours` are gone — remove it, and the `LocalizedString` import if nothing else in the file needs it. Lint will name both.

- [ ] **Step 3: Narrow the schema**

In `lib/auth/schemas.ts`, remove `phone`, `email`, `address` and `workHours` from `settingsSchema`. If `optionalLocalized` is now unused, remove it too — check first with `grep -n "optionalLocalized" lib/auth/schemas.ts`, since another schema may use it.

- [ ] **Step 4: Strip the form's Contact section**

In `components/admin/settings-form.tsx`, remove the four fields from `draft` and from the payload, delete the Contact `<section>` and the locale-tab section that only served address and working hours, and remove any now-unused imports and state. The colour and typography sections stay exactly as they are.

If removing the locale tabs leaves `locale`/`setLocale` and the `LOCALES` constant unused, remove them too — but check the colour and typography sections do not reference them first.

- [ ] **Step 5: Point the settings page at the new home**

In `app/admin/settings/page.tsx`, change the description so an operator does not hunt for the phone field where it used to be:

```tsx
        <p className="text-muted-foreground mt-1 text-sm">
          Brand colours and the typeface. Clearing a field restores its default.
          Phone numbers and addresses live under{" "}
          <Link href="/admin/locations" className="underline">
            Locations
          </Link>
          .
        </p>
```

Add `import Link from "next/link";` at the top.

- [ ] **Step 6: Drop the now-unused `settings` prop**

In `components/layout/site-header.tsx` and `components/layout/site-footer.tsx`, remove the `settings` prop and its type import — after Task 6 neither reads it. Then remove the corresponding props from the two call sites in `app/[locale]/layout.tsx`.

Leave `getSiteSettings()` itself in the layout: the theme `<style>` block still needs it.

- [ ] **Step 7: Fix the settings verification script**

`scripts/verify-settings.ts` asserts on `phone`, `address` and the localized merge, all of which are gone. Remove exactly those checks and leave the colour, font and never-throws ones. Report the new check count in your report.

Do not delete the whole file, and do not weaken the remaining checks.

- [ ] **Step 8: Typecheck, lint and build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: no errors. This step is the real gate for the task — the compiler finds every consumer of a field that no longer exists.

- [ ] **Step 9: Run both verification scripts**

Run: `NODE_OPTIONS="--require <scratchpad>/dns-fix.cjs" npm run verify:locations`
Run: `NODE_OPTIONS="--require <scratchpad>/dns-fix.cjs --require <scratchpad>/font-fix.cjs" npm run verify:settings`
Expected: locations unchanged at 19; settings passing at its reduced count.

- [ ] **Step 10: Commit**

```bash
git add lib/settings/defaults.ts lib/queries/settings.ts lib/auth/schemas.ts components/admin/settings-form.tsx app/admin/settings/page.tsx components/layout/site-header.tsx components/layout/site-footer.tsx scripts/verify-settings.ts
git commit -m "refactor: move contact details out of site settings

A single phone and address cannot describe three branches. Site settings keeps the
brand colours and the typeface; the settings page now points at Locations so an
operator does not hunt for the phone field where it used to be.

Nothing is migrated because nothing was stored: the values leaving here were
constants, and they are now the built-in default branch."
```

---

### Task 8: Verification pass

**Files:**
- Modify: `scripts/verify-locations.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: no new exports.

- [ ] **Step 1: Lock in the delete guard**

The last-location refusal is the one rule with no coverage — every other check exercises the read path. Append inside the `try` block of `scripts/verify-locations.ts`, after the existing checks:

```ts
    await cleanup();
    await StoreLocation.create(fixture("only", 10));

    const totalWithOne = await StoreLocation.countDocuments({});
    check("the guard's count sees exactly one branch", totalWithOne === 1);

    await StoreLocation.create(fixture("second-branch", 20));
    const totalWithTwo = await StoreLocation.countDocuments({});
    check("and two once another is added", totalWithTwo === 2);
```

This asserts the condition the handler branches on rather than calling the route, which would need a session. Say so in your report: the HTTP refusal itself is covered by the browser pass.

- [ ] **Step 2: Run the script twice**

Run: `NODE_OPTIONS="--require <scratchpad>/dns-fix.cjs" npm run verify:locations`
Expected: `21 checks passed`. Run it a second time — a clean second run proves the cleanup worked.

- [ ] **Step 3: Browser pass**

With `npm run dev` running and signed in as an admin. Record each result:

1. With no location stored, the footer and header look exactly as they did before this branch, and `/locations` shows the single default branch.
2. Create one branch: the footer shows it without a name line; the header phone is its phone.
3. Create a second and third: all three list in the footer with their names, no "All locations" link.
4. Create a fourth: the footer shows the first three plus the link, which reaches `/locations`.
5. `/locations` renders every active branch in ka, en and ru, with hours.
6. A branch with a map URL shows a Directions link that opens Google Maps in a new tab.
7. A branch without one shows no Directions link.
8. Reordering makes a different branch primary — the header phone changes.
9. Deactivating a branch removes it from the footer and `/locations`, but it stays in the admin list.
10. Deleting a branch when it is the only one is refused with the message naming the alternative; deleting one of several succeeds.
11. A map URL of `https://example.com/x` is refused in the form.
12. `/admin/settings` no longer has contact fields and points at Locations.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-locations.ts
git commit -m "test: cover the count the last-location guard branches on

Every other check exercises the read path; the refusal that keeps the site from
silently reverting to its built-in address had none."
```

---

## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| `Location` model, localized name/address/hours, single phone | 1 |
| `getLocations()`, active-only, ordered | 1 |
| Primary is the first by order, no `isPrimary` flag | 1 (query), 4 (list marker) |
| `DEFAULT_LOCATION`, empty case | 1 |
| `mapUrl` allowlist, exact host match | 2 (rule), 3 (enforcement), 5 (message) |
| Last-location delete refusal | 3 (handler), 4 (message), 8 (count check) |
| `/admin/locations` list, new, edit, row delete | 4, 5 |
| Footer lists up to three, link at four | 6 |
| Header "Showroom" → `/locations`, primary phone | 6 |
| Mobile nav and product page use the primary | 6 |
| `/locations` page with hours, email, directions | 6 |
| Four fields leave `SiteSettings` | 7 |
| No migration script | 7 (stated in the commit and the docblock) |
| Spec test items 1-8 | 1, 2, 8 |
| Spec test items 9-17 | 8 (browser pass) |

**Type consistency**

`StoreLocation` is defined once in Task 1 and consumed unchanged in Tasks 4, 5 and 6. `AdminLocationRow` is defined in Task 4 and consumed in Task 5. `isMapUrl` and `MAP_HOSTS` are produced in Task 2 and consumed in Tasks 3 and 5. The field code `map_host` is emitted in Task 3 and rendered by `messageFor` in Task 5. `getPrimaryLocation` is used by the header and the product page in Task 6; `getLocations` by the layout, the footer list and the locations page.

**Known judgement calls left to the implementer**

Task 1 Step 6 carries a documented fallback if React's `cache()` memo defeats the script's repeated reads. Task 7 Steps 2-4 deliberately delegate "which imports and helpers are now unused" to lint rather than listing them from a stale reading of the files. Task 7 Step 7 requires judgement about which settings checks to remove — the instruction is to remove exactly the contact ones and leave the rest.

**One thing this plan does not do**

It does not add `LocalBusiness` JSON-LD per branch. The spec puts it out of scope and with Phase 5's other structured data, and this plan agrees.

**The repetition, stated once**

This is the fourth admin section built to the same list / new / edit / row-delete shape. The spec notes that at four it is worth extracting a shared scaffold, and that doing so inside this feature would mean refactoring three shipped sections while adding a fourth. This plan therefore repeats the pattern deliberately rather than by omission.
