# Admin Site Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin change the site's contact details, brand colours and typeface from `/admin/settings`, without a deploy.

**Architecture:** One `SiteSettings` singleton in Mongo, read once per request through a `cache()`-wrapped query that merges over a `DEFAULT_SETTINGS` constant so every consumer always receives a fully-populated object. The root layout injects the two brand colours as an inline `<style>` override in `<head>` and applies the chosen font's CSS variable; contact details are passed as props to the header, footer and product page, replacing three hardcoded constants.

**Tech Stack:** Next.js 16 (App Router, `LayoutProps`/`PageProps`/`RouteContext` typed helpers), React 19, Mongoose 9, Zod, Tailwind v4 (`@theme inline`), `next/font/google`, next-intl (storefront only).

**Spec:** `docs/superpowers/specs/2026-08-09-admin-site-settings-design.md`

## Global Constraints

- **Read the Next.js docs first.** `AGENTS.md` requires it: this Next version has breaking changes versus training data. Guides are in `node_modules/next/dist/docs/`. Route context is `RouteContext<"/api/admin/settings">`, page props are `PageProps<"...">`, layout props are `LayoutProps<"/[locale]">`, and `params` is always a Promise. Copy shapes from the existing `app/api/admin/categories/[id]/route.ts` and `app/[locale]/layout.tsx` rather than writing them from memory.
- **The admin tree is unlocalised, English-only.** `proxy.ts` excludes `/admin` from the next-intl middleware. No `next-intl` imports in admin pages or components.
- **Every admin API handler runs `assertSameOrigin(request)` then `requireAdmin()`, in that order, before anything else** — both from `@/lib/auth/guard`.
- **Error shapes come from `@/lib/api`:** `validationError({field: code})`, `notFoundJson(...)`, `apiError(error)` in every catch.
- **`getSiteSettings()` must never throw.** It is called from the root layout, so it is on the path of every page. On any error it logs and returns `DEFAULT_SETTINGS`.
- **Every settings field is optional, and empty means "use the default".** Defaults live only in `lib/settings/defaults.ts`.
- **Colours are `#rrggbb` hex only.** Strict regex `^#[0-9a-fA-F]{6}$`. This is a security boundary as well as a validation rule: the value is interpolated into a `<style>` block, and anything that could terminate the declaration could inject rules.
- **Dark mode is currently dormant.** `next-themes` is a dependency, but no `ThemeProvider` is mounted and nothing adds the `.dark` class — verified by grep. Emit the `.dark` override anyway so it is correct when dark mode is switched on, but do NOT wire up a theme provider as part of this work, and do not treat "the dark preview does nothing" as a bug.
- **Existing message keys stay.** `footer.address` and `footer.workHours` in `messages/*.json` remain and serve as the localized defaults.
- **No test runner exists in this repo and adding one is forbidden.** Verification is `npx tsc --noEmit`, `npm run lint`, `npm run verify:settings` (created in Task 1), and a browser pass.
- **Commit after every task.** Conventional Commits, English prose.

---

## File Structure

**Create:**
- `lib/models/site-settings.ts` — the singleton Mongoose model.
- `lib/settings/defaults.ts` — `DEFAULT_SETTINGS` and the `ResolvedSettings` type. The one place that answers "what does the site look like with no settings row".
- `lib/settings/colors.ts` — hex parsing, WCAG relative luminance, contrast ratio, and the light/dark shade derivation. Pure functions, no database, no React.
- `lib/settings/fonts.ts` — the `FONTS` allowlist with its `next/font/google` loader calls.
- `lib/queries/settings.ts` — `getSiteSettings()`.
- `app/api/admin/settings/route.ts` — PATCH.
- `app/admin/settings/page.tsx` — the admin page.
- `components/admin/settings-form.tsx` — the form.
- `components/layout/settings-style.tsx` — renders the injected `<style>` block.
- `scripts/verify-settings.ts` — DB-level checks.

**Modify:**
- `app/globals.css` — indirection so the font face can be swapped at runtime (Task 3).
- `app/[locale]/layout.tsx` — read settings, apply font variables and the style block.
- `components/layout/site-header.tsx:19` — drop `const PHONE`.
- `components/layout/site-footer.tsx:10` — drop `const PHONE`, read address/hours/email from settings.
- `app/[locale]/p/[slug]/page.tsx:33` — drop `const PHONE`.
- `lib/auth/schemas.ts` — add `settingsSchema`.
- `app/admin/layout.tsx` — nav entry.
- `package.json` — `verify:settings` script.

---

### Task 1: Model, defaults, read layer, verification harness

**Files:**
- Create: `lib/models/site-settings.ts`, `lib/settings/defaults.ts`, `lib/queries/settings.ts`, `scripts/verify-settings.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `SiteSettings` model from `lib/models/site-settings.ts`, plus `SETTINGS_ID` (the fixed `_id`).
  - `type ResolvedSettings = { phone: string; email: string; address: LocalizedString; workHours: LocalizedString; brandYellow: string; brandBlack: string; fontKey: string }` and `DEFAULT_SETTINGS: ResolvedSettings` from `lib/settings/defaults.ts`.
  - `getSiteSettings(): Promise<ResolvedSettings>` from `lib/queries/settings.ts`.
  - `npm run verify:settings`.

- [ ] **Step 1: Write the model**

Create `lib/models/site-settings.ts`:

```ts
import { type InferSchemaType, type Model, Schema, model, models } from "mongoose";
import { Types } from "mongoose";

import { optionalLocalizedStringSchema } from "./shared";

/**
 * A fixed `_id` is what makes this a singleton.
 *
 * Two admins saving at once both upsert the same document rather than racing to
 * create a second one, and every read is a primary-key lookup with no sort or
 * "first document" convention to get wrong.
 */
export const SETTINGS_ID = new Types.ObjectId("000000000000000000000001");

const siteSettingsSchema = new Schema(
  {
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    // Even Georgian is optional here: an unset field means "use the default",
    // which is the translated string already in messages/*.json.
    address: { type: optionalLocalizedStringSchema },
    workHours: { type: optionalLocalizedStringSchema },
    brandYellow: { type: String, trim: true },
    brandBlack: { type: String, trim: true },
    fontKey: { type: String, trim: true },
  },
  { timestamps: true },
);

export type SiteSettingsDocument = InferSchemaType<typeof siteSettingsSchema>;

/**
 * `models.SiteSettings ??` is not optional: dev hot reload re-runs this module
 * against a connection that already has the model compiled, and a second
 * `model()` call throws OverwriteModelError.
 */
export const SiteSettings: Model<SiteSettingsDocument> =
  (models.SiteSettings as Model<SiteSettingsDocument>) ??
  model<SiteSettingsDocument>("SiteSettings", siteSettingsSchema);
```

- [ ] **Step 2: Write the defaults**

Create `lib/settings/defaults.ts`. The values are exactly what the site renders today — the phone from the three `const PHONE` declarations, the address and hours from `messages/*.json`, the colours from `app/globals.css:85-87`.

```ts
import type { LocalizedString } from "../types";

export type ResolvedSettings = {
  phone: string;
  /** Empty means the footer renders no email row at all. */
  email: string;
  address: LocalizedString;
  workHours: LocalizedString;
  brandYellow: string;
  brandBlack: string;
  fontKey: string;
};

/**
 * What the site looks like with no settings row.
 *
 * The settings document is read in the root layout, so it is on the path of
 * every page: a first deploy against an empty database, a deleted document or an
 * unreachable Atlas must all degrade to the site as it shipped, not to a blank
 * one. Keeping the fallbacks in one constant is what makes that claim checkable —
 * the alternative is a `??` in every consumer, and one of them will be missed.
 */
export const DEFAULT_SETTINGS: ResolvedSettings = {
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
  brandYellow: "#fec303",
  brandBlack: "#010101",
  fontKey: "manrope",
};
```

These localized strings were copied verbatim from `messages/ka.json:111-112`, `messages/en.json:111-112` and `messages/ru.json`. Re-run `grep -n "workHours\|address" messages/ka.json` before writing the file and confirm they still match — if the copy has changed since, the message file wins, not this plan.

- [ ] **Step 3: Write the read**

Create `lib/queries/settings.ts`:

```ts
import { cache } from "react";

import { connectToDatabase } from "../db";
import { SETTINGS_ID, SiteSettings } from "../models/site-settings";
import { DEFAULT_SETTINGS, type ResolvedSettings } from "../settings/defaults";
import type { LocalizedString } from "../types";

/** A stored localized value wins only for the locales it actually fills in. */
function mergeLocalized(
  stored: { ka?: string | null; en?: string | null; ru?: string | null } | null | undefined,
  fallback: LocalizedString,
): LocalizedString {
  return {
    ka: stored?.ka?.trim() || fallback.ka,
    en: stored?.en?.trim() || fallback.en,
    ru: stored?.ru?.trim() || fallback.ru,
  };
}

/**
 * The whole settings document, merged over the defaults.
 *
 * `cache()` collapses the layout's, header's, footer's and product page's reads
 * into one query per request. There is deliberately no Next data-cache tag: the
 * document is a handful of fields fetched by primary key, and a theme that stays
 * stale after a save would be a worse failure than one extra query per render.
 *
 * It never throws. It is called from the root layout, so an error propagating out
 * of here takes down every page on the site rather than one component.
 */
export const getSiteSettings = cache(async (): Promise<ResolvedSettings> => {
  try {
    await connectToDatabase();
    const doc = await SiteSettings.findById(SETTINGS_ID).lean();
    if (!doc) return DEFAULT_SETTINGS;

    return {
      phone: doc.phone?.trim() || DEFAULT_SETTINGS.phone,
      email: doc.email?.trim() || DEFAULT_SETTINGS.email,
      address: mergeLocalized(doc.address, DEFAULT_SETTINGS.address),
      workHours: mergeLocalized(doc.workHours, DEFAULT_SETTINGS.workHours),
      brandYellow: doc.brandYellow?.trim() || DEFAULT_SETTINGS.brandYellow,
      brandBlack: doc.brandBlack?.trim() || DEFAULT_SETTINGS.brandBlack,
      fontKey: doc.fontKey?.trim() || DEFAULT_SETTINGS.fontKey,
    };
  } catch (error) {
    console.error("[settings] falling back to defaults", error);
    return DEFAULT_SETTINGS;
  }
});
```

- [ ] **Step 4: Write the verification script**

Create `scripts/verify-settings.ts`. Model it on the existing `scripts/verify-brands.ts` — same `check()` helper, same `finally`-based cleanup.

```ts
/**
 * DB-level checks for site settings.
 *
 * Run with `npm run verify:settings`. It writes to whatever MONGODB_URI points
 * at, like the seed script. The settings document is a singleton with a fixed
 * id, so this script SAVES AND RESTORES the real one rather than using a
 * prefixed fixture: it snapshots the document first and puts it back in the
 * `finally`, including when an assertion throws.
 */
import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";

import { SETTINGS_ID, SiteSettings } from "../lib/models/site-settings";
import { DEFAULT_SETTINGS } from "../lib/settings/defaults";

loadEnvConfig(process.cwd());

let passed = 0;

function check(label: string, condition: boolean) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  passed += 1;
  console.log(`  ok  ${label}`);
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);

  const snapshot = await SiteSettings.findById(SETTINGS_ID).lean();

  try {
    await SiteSettings.deleteOne({ _id: SETTINGS_ID });

    const { getSiteSettings } = await import("../lib/queries/settings");
    const empty = await getSiteSettings();
    check("with no document, every field is populated", Boolean(empty.phone && empty.brandYellow && empty.fontKey));
    check("and it equals DEFAULT_SETTINGS", JSON.stringify(empty) === JSON.stringify(DEFAULT_SETTINGS));

    await SiteSettings.updateOne(
      { _id: SETTINGS_ID },
      { $set: { phone: "+995 000 00 00 00", address: { ka: "ტესტი" } } },
      { upsert: true },
    );

    // `cache()` memoises per React request scope; in a plain script each call
    // re-reads, which is what the next assertion depends on.
    const partial = await (await import("../lib/queries/settings")).getSiteSettings();
    check("a stored field wins", partial.phone === "+995 000 00 00 00");
    check("an unset field still falls back", partial.brandYellow === DEFAULT_SETTINGS.brandYellow);
    check("a stored ka wins for ka", partial.address.ka === "ტესტი");
    check("an unset en falls back to the default en", partial.address.en === DEFAULT_SETTINGS.address.en);

    await SiteSettings.updateOne({ _id: SETTINGS_ID }, { $set: { phone: "+995 111" } }, { upsert: true });
    check("saving twice upserts rather than duplicating", (await SiteSettings.countDocuments({})) === 1);
  } finally {
    await SiteSettings.deleteOne({ _id: SETTINGS_ID });
    if (snapshot) {
      const { _id, ...rest } = snapshot;
      await SiteSettings.create({ _id, ...rest });
    }
    await mongoose.disconnect();
  }

  console.log(`\n${passed} checks passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Note on the `cache()` re-import: `getSiteSettings` is memoised, so calling the same imported reference twice in one process returns the first result. Re-importing does NOT clear a React `cache()` memo in every runtime. If check 3 fails because it still sees the first read's value, replace the second call with a direct `SiteSettings.findById(SETTINGS_ID).lean()` plus the same merge assertions, and say so in your report — do not delete the check.

- [ ] **Step 5: Register the script**

In `package.json`, after `"verify:brands"`:

```json
    "verify:settings": "tsx scripts/verify-settings.ts",
```

- [ ] **Step 6: Run it**

Run: `npm run verify:settings`
Expected: seven `ok` lines then `7 checks passed`, and the pre-existing settings document (if any) restored afterwards.

- [ ] **Step 7: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add lib/models/site-settings.ts lib/settings/defaults.ts lib/queries/settings.ts scripts/verify-settings.ts package.json
git commit -m "feat: read site settings, with the current site as the fallback

A singleton document holding contact details, brand colours and the font key.
Every field is optional and getSiteSettings merges over DEFAULT_SETTINGS, so a
consumer always receives a fully-populated object.

The read never throws. It is called from the root layout, which puts it on the
path of every page: an empty database or an unreachable Atlas has to degrade to
the site as it shipped, not take it down."
```

---

### Task 2: Colour maths — contrast guard and shade derivation

**Files:**
- Create: `lib/settings/colors.ts`
- Modify: `scripts/verify-settings.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces, all from `lib/settings/colors.ts`:
  - `HEX = /^#[0-9a-fA-F]{6}$/`
  - `contrastRatio(a: string, b: string): number`
  - `shade(hex: string, amount: number): string` — negative darkens, positive lightens, `amount` in −1…1
  - `derivedShades(brandYellow: string): { light: string; dark: string }`

- [ ] **Step 1: Write the module**

Create `lib/settings/colors.ts`:

```ts
/**
 * Colour maths for the admin theme fields.
 *
 * Pure functions, no database and no React, because both the API route and the
 * form need them and neither should reach into the other.
 */

export const HEX = /^#[0-9a-fA-F]{6}$/;

function channels(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function toHex(channel: number): string {
  return Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0");
}

/** WCAG 2.1 relative luminance. The 0.03928 kink is the sRGB transfer curve. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/** Moves a colour toward black (negative) or white (positive). */
export function shade(hex: string, amount: number): string {
  const target = amount < 0 ? 0 : 255;
  const weight = Math.abs(amount);
  const [r, g, b] = channels(hex);
  return `#${toHex(r + (target - r) * weight)}${toHex(g + (target - g) * weight)}${toHex(b + (target - b) * weight)}`;
}

/**
 * The hover shade, derived rather than stored.
 *
 * globals.css hand-tuned #fec303 to #e0a800 for light and #ffd23f for dark; these
 * weights reproduce that relationship for any brand colour. A third input for a
 * hover shade would be a field nobody could reason about.
 */
export function derivedShades(brandYellow: string): { light: string; dark: string } {
  return { light: shade(brandYellow, -0.12), dark: shade(brandYellow, 0.16) };
}
```

- [ ] **Step 2: Add colour checks to the verification script**

In `scripts/verify-settings.ts`, inside the `try` block after the existing checks:

```ts
    const { HEX, contrastRatio, derivedShades, shade } = await import("../lib/settings/colors");

    check("the default yellow carries black text", contrastRatio("#fec303", "#101010") >= 4.5);
    check("a mid grey does not", contrastRatio("#767676", "#101010") < 4.5);
    check("black on white is the maximum", Math.round(contrastRatio("#000000", "#ffffff")) === 21);
    check("contrast is symmetric", contrastRatio("#fec303", "#101010") === contrastRatio("#101010", "#fec303"));
    check("darkening moves toward black", shade("#fec303", -0.12) < "#fec303");
    check("the derived light shade is close to the hand-tuned one", derivedShades("#fec303").light.startsWith("#e0"));
    check("the derived dark shade is lighter than the source", derivedShades("#fec303").dark > "#fec303");

    for (const bad of ["red", "#ff0", "#GGGGGG", "#fff);body{display:none", "fec303"]) {
      check(`the hex regex refuses ${JSON.stringify(bad)}`, !HEX.test(bad));
    }
    check("the hex regex accepts #fec303", HEX.test("#fec303"));
```

The string comparisons on hex values work because both sides are the same fixed-width `#rrggbb` format — lexicographic order matches numeric order here. That is a property of the format, not a general rule.

- [ ] **Step 3: Run the verification script**

Run: `npm run verify:settings`
Expected: `20 checks passed`.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/settings/colors.ts scripts/verify-settings.ts
git commit -m "feat: contrast maths for the brand colour fields

Brand yellow carries black text everywhere it appears — badges, sale tags, and the
primary button once dark mode is switched on. A dark choice would produce
unreadable text with nothing failing, so saves are measured against WCAG contrast
rather than trusted.

The hover shade is derived from the brand colour instead of being a third input:
the weights here reproduce the relationship globals.css hand-tuned."
```

---

### Task 3: Font allowlist and the CSS indirection that lets it swap

**Files:**
- Create: `lib/settings/fonts.ts`
- Modify: `app/globals.css:18-27`

**Interfaces:**
- Consumes: nothing.
- Produces from `lib/settings/fonts.ts`:
  - `type FontEntry = { key: string; label: string; variable: string; className: string }`
  - `FONTS: FontEntry[]`
  - `FONT_KEYS: string[]`
  - `findFont(key: string): FontEntry` — falls back to the first entry
  - `fontClassNames(): string` — every entry's `variable` class, space-joined, for the `<html>` element

- [ ] **Step 1: Establish how the font token actually compiles**

`app/globals.css:6` opens `@theme inline { … }`, and `--font-sans` is declared there as `var(--font-manrope), var(--font-noto-georgian), …`. With the `inline` keyword Tailwind substitutes a token's *value* into the utility rather than emitting `var(--font-sans)`. If that holds, redefining `--font-sans` at runtime would not reach the `font-sans` utility at all, and the override has to target `--font-manrope` instead.

Find out rather than assume:

Run: `npm run build && grep -rn "font-manrope\|--font-sans" .next/static/css/*.css | head -20`

- If the compiled `.font-sans` rule contains `var(--font-manrope)`, the substitution happened: proceed with Step 2, which renames the inner variable so the override target is honestly named.
- If it contains `var(--font-sans)`, no rename is needed: skip Step 2, and in Task 5 override `--font-sans` and `--font-heading` directly. Say which branch you took in your report.

- [ ] **Step 2: Add the indirection (only if Step 1 showed value substitution)**

In `app/globals.css`, change the two font tokens inside `@theme inline` to point at a swappable variable, and define its default in `:root`. Replace the `--font-sans` and `--font-heading` declarations (keeping the existing comment above them intact):

```css
  --font-sans: var(--font-body), var(--font-noto-georgian), "Segoe UI", Sylfaen,
    "Noto Sans", ui-sans-serif, system-ui, sans-serif;
  --font-heading: var(--font-body), var(--font-noto-georgian), "Segoe UI", Sylfaen,
    "Noto Sans", ui-sans-serif, system-ui, sans-serif;
```

and add to the `:root` block, next to the brand colours:

```css
  /* The face the admin picks. Indirection, not decoration: the utilities above
     inline this variable's *reference*, so a runtime override of --font-body
     reaches every `font-sans` and `font-heading` utility without rebuilding.
     Defaults to Manrope, which is what the site shipped with. */
  --font-body: var(--font-manrope);
```

Leave `--font-mono` exactly as it is. The mono face is fixed.

- [ ] **Step 3: Write the allowlist**

Create `lib/settings/fonts.ts`:

```ts
import {
  Archivo,
  Figtree,
  Inter,
  Manrope,
  Plus_Jakarta_Sans,
  Rubik,
  Source_Sans_3,
} from "next/font/google";

/**
 * The faces an admin can choose from.
 *
 * `next/font` is analysed at build time — a family name read from the database
 * cannot be passed to a loader. So every option is loaded here at module scope
 * and stays self-hosted; the stored key only decides which variable
 * `--font-body` resolves to.
 *
 * Only the default is preloaded. The others are declared so their CSS exists,
 * but the browser fetches a face only when a rule actually references it, so the
 * cost of a long list is build size rather than page weight. That is also why
 * this list is deliberately short.
 *
 * Georgian: Source Sans 3 and Rubik carry Mkhedruli; the rest fall through to
 * Noto Sans Georgian per glyph, exactly as Manrope does today. The Georgian
 * stack in globals.css therefore stays appended for every entry.
 */
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin", "cyrillic"], display: "swap" });
const inter = Inter({ variable: "--font-inter", subsets: ["latin", "cyrillic"], display: "swap", preload: false });
const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"], display: "swap", preload: false });
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], display: "swap", preload: false });
const sourceSans = Source_Sans_3({ variable: "--font-source-sans", subsets: ["latin", "cyrillic"], display: "swap", preload: false });
const rubik = Rubik({ variable: "--font-rubik", subsets: ["latin", "cyrillic"], display: "swap", preload: false });
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], display: "swap", preload: false });

export type FontEntry = {
  key: string;
  label: string;
  /** The CSS variable name the loader defines, e.g. `--font-inter`. */
  variable: string;
  /** The class that puts that variable in scope, applied to <html>. */
  className: string;
};

export const FONTS: FontEntry[] = [
  { key: "manrope", label: "Manrope", variable: "--font-manrope", className: manrope.variable },
  { key: "inter", label: "Inter", variable: "--font-inter", className: inter.variable },
  { key: "figtree", label: "Figtree", variable: "--font-figtree", className: figtree.variable },
  { key: "jakarta", label: "Plus Jakarta Sans", variable: "--font-jakarta", className: jakarta.variable },
  { key: "source-sans", label: "Source Sans 3", variable: "--font-source-sans", className: sourceSans.variable },
  { key: "rubik", label: "Rubik", variable: "--font-rubik", className: rubik.variable },
  { key: "archivo", label: "Archivo", variable: "--font-archivo", className: archivo.variable },
];

export const FONT_KEYS = FONTS.map((font) => font.key);

/** Falls back to the default rather than throwing: a stale key must not 500 a page. */
export function findFont(key: string): FontEntry {
  return FONTS.find((font) => font.key === key) ?? FONTS[0];
}

/** Every face's class, so any of their variables can be referenced at runtime. */
export function fontClassNames(): string {
  return FONTS.map((font) => font.className).join(" ");
}
```

- [ ] **Step 4: Confirm every family exists in the installed next/font**

Run: `node -e "const f=require('next/font/google'); for (const n of ['Archivo','Figtree','Inter','Manrope','Plus_Jakarta_Sans','Rubik','Source_Sans_3']) console.log(n, typeof f[n])"`
Expected: `function` for all seven. If any prints `undefined`, that family is not available in this version — drop it from the array and say which in your report. Do not substitute a family that was not vetted.

- [ ] **Step 5: Typecheck, lint and build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: no errors. The build is the real check here — an invalid `next/font` loader call fails at build time, not typecheck time.

- [ ] **Step 6: Commit**

```bash
git add lib/settings/fonts.ts app/globals.css
git commit -m "feat: font allowlist for the theme setting

next/font is analysed at build time, so a family name read from the database
cannot be passed to a loader. Every option is loaded here at module scope and
stays self-hosted; the stored key only decides which variable --font-body
resolves to. Only the default preloads, so the cost of the list is build size
rather than page weight."
```

---

### Task 4: Validation schema and the PATCH endpoint

**Files:**
- Modify: `lib/auth/schemas.ts` (after `brandSchema`)
- Create: `app/api/admin/settings/route.ts`

**Interfaces:**
- Consumes: `HEX`, `contrastRatio` from `lib/settings/colors.ts`; `FONT_KEYS` from `lib/settings/fonts.ts`; `SETTINGS_ID`, `SiteSettings` from `lib/models/site-settings.ts`.
- Produces the HTTP contract Task 7's form codes against:
  - `PATCH /api/admin/settings` → `200 { ok: true }`
  - `422 { error: "validation_failed", fields: {...} }` with codes `hex_format`, `low_contrast`, `required`, `invalid`
  - a low-contrast rejection also carries `ratio: number`

- [ ] **Step 1: Add the schema**

In `lib/auth/schemas.ts`, after `brandSchema`:

```ts
const optionalLocalized = z.object({
  ka: z.string().trim().max(200).optional().or(z.literal("")),
  en: z.string().trim().max(200).optional().or(z.literal("")),
  ru: z.string().trim().max(200).optional().or(z.literal("")),
});

/**
 * Every field is optional: empty means "fall back to the default", which is what
 * clearing a box in the form has to mean.
 *
 * The hex rule is a security boundary, not only a validation one — the value is
 * interpolated into a <style> block, so anything that could close the
 * declaration could inject rules of its own.
 */
export const settingsSchema = z.object({
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().toLowerCase().max(254).email().optional().or(z.literal("")),
  address: optionalLocalized.optional(),
  workHours: optionalLocalized.optional(),
  brandYellow: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "hex_format")
    .optional()
    .or(z.literal("")),
  brandBlack: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "hex_format")
    .optional()
    .or(z.literal("")),
  fontKey: z.string().trim().max(40).optional().or(z.literal("")),
});
```

- [ ] **Step 2: Write the handler**

Create `app/api/admin/settings/route.ts`:

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, validationError } from "@/lib/api";
import { assertSameOrigin, requireAdmin } from "@/lib/auth/guard";
import { fieldErrors, settingsSchema } from "@/lib/auth/schemas";
import { connectToDatabase } from "@/lib/db";
import { SETTINGS_ID, SiteSettings } from "@/lib/models/site-settings";
import { contrastRatio } from "@/lib/settings/colors";
import { FONT_KEYS } from "@/lib/settings/fonts";

/** Text painted on each brand colour, so the guard measures the real pairing. */
const ON_YELLOW = "#101010";
const ON_BLACK = "#ffffff";
const MIN_RATIO = 4.5;

/**
 * Updates the singleton.
 *
 * There is no POST and no DELETE: the document is created by its first save, and
 * clearing a field back to empty restores its default, which is what an operator
 * means by removing a value.
 */
export async function PATCH(request: NextRequest) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const parsed = settingsSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(fieldErrors(parsed.error));

    const { brandYellow, brandBlack, fontKey } = parsed.data;

    if (fontKey && !FONT_KEYS.includes(fontKey)) {
      return validationError({ fontKey: "invalid" });
    }

    /**
     * Brand yellow carries black text everywhere it appears. A dark choice would
     * render black-on-dark with nothing failing loudly, so it is measured rather
     * than trusted.
     */
    if (brandYellow) {
      const ratio = contrastRatio(brandYellow, ON_YELLOW);
      if (ratio < MIN_RATIO) {
        return NextResponse.json(
          { error: "validation_failed", fields: { brandYellow: "low_contrast" }, ratio: Number(ratio.toFixed(2)) },
          { status: 422 },
        );
      }
    }

    if (brandBlack) {
      const ratio = contrastRatio(brandBlack, ON_BLACK);
      if (ratio < MIN_RATIO) {
        return NextResponse.json(
          { error: "validation_failed", fields: { brandBlack: "low_contrast" }, ratio: Number(ratio.toFixed(2)) },
          { status: 422 },
        );
      }
    }

    await connectToDatabase();
    await SiteSettings.updateOne(
      { _id: SETTINGS_ID },
      {
        $set: {
          phone: parsed.data.phone ?? "",
          email: parsed.data.email ?? "",
          address: parsed.data.address ?? {},
          workHours: parsed.data.workHours ?? {},
          brandYellow: brandYellow ?? "",
          brandBlack: brandBlack ?? "",
          fontKey: fontKey ?? "",
        },
      },
      { upsert: true },
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Smoke-test the guard**

With `npm run dev` running:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH http://localhost:3000/api/admin/settings \
  -H "Content-Type: application/json" -d '{"phone":"+995 1"}'
```

Expected: `401` — no session cookie, so `requireAdmin` rejects before any write. (`403` is the signed-in-non-admin case.) Anything 2xx means a guard is missing.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/schemas.ts app/api/admin/settings/route.ts
git commit -m "feat: site settings endpoint, with a contrast guard on the brand colours

Every field is optional because clearing a box has to mean 'use the default'.
Brand yellow is measured against the black text it carries and refused below
4.5:1, with the ratio returned so the form can say what it actually was.

The hex rule is a security boundary as much as a validation one: the value is
interpolated into a style block."
```

---

### Task 5: Inject the theme in the root layout

**Files:**
- Create: `components/layout/settings-style.tsx`
- Modify: `app/[locale]/layout.tsx:3`, `:14-32`, `:104-129`

**Interfaces:**
- Consumes: `getSiteSettings`, `DEFAULT_SETTINGS`, `derivedShades`, `findFont`, `fontClassNames`.
- Produces: `<SettingsStyle settings={ResolvedSettings} />`.

- [ ] **Step 1: Write the style component**

Create `components/layout/settings-style.tsx`:

```tsx
import { derivedShades } from "@/lib/settings/colors";
import { DEFAULT_SETTINGS, type ResolvedSettings } from "@/lib/settings/defaults";
import { findFont } from "@/lib/settings/fonts";

/**
 * The admin's overrides, as CSS variables.
 *
 * Only what differs from the defaults is emitted, so an untouched site ships no
 * extra bytes and globals.css stays the single description of the theme.
 *
 * It renders in <head> and inline, which is the point: a stylesheet request or a
 * client effect would both paint the default palette first and then correct it.
 *
 * The values are safe to interpolate because the schema already restricted them
 * to `#rrggbb` and to a key from the font allowlist — there is no path here for a
 * value that could close the declaration.
 */
export function SettingsStyle({ settings }: { settings: ResolvedSettings }) {
  const declarations: string[] = [];
  const darkDeclarations: string[] = [];

  if (settings.brandYellow !== DEFAULT_SETTINGS.brandYellow) {
    const shades = derivedShades(settings.brandYellow);
    declarations.push(`--brand-yellow:${settings.brandYellow}`, `--brand-yellow-dark:${shades.light}`);
    darkDeclarations.push(`--brand-yellow:${settings.brandYellow}`, `--brand-yellow-dark:${shades.dark}`);
  }

  if (settings.brandBlack !== DEFAULT_SETTINGS.brandBlack) {
    declarations.push(`--brand-black:${settings.brandBlack}`);
  }

  if (settings.fontKey !== DEFAULT_SETTINGS.fontKey) {
    declarations.push(`--font-body:var(${findFont(settings.fontKey).variable})`);
  }

  if (!declarations.length && !darkDeclarations.length) return null;

  const css = [
    declarations.length ? `:root{${declarations.join(";")}}` : "",
    // Dark mode is dormant today — nothing applies the .dark class yet. Emitted
    // so the override is already correct when it is switched on.
    darkDeclarations.length ? `.dark{${darkDeclarations.join(";")}}` : "",
  ].join("");

  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
```

If Task 3 Step 1 took the branch where no rename was needed, replace the `--font-body` line with two declarations setting `--font-sans` and `--font-heading` to the full stack, copying the stack verbatim from `globals.css` with `var(--font-manrope)` swapped for the chosen variable.

- [ ] **Step 2: Rewire the layout's fonts**

In `app/[locale]/layout.tsx`, replace the three loader calls at lines 14-32 with imports. Manrope moves into `lib/settings/fonts.ts` (Task 3); Noto Sans Georgian and JetBrains Mono stay here, because they are not choices — they are the Georgian and mono stacks every option depends on.

Change line 3 to keep only the two fixed faces:

```ts
import { JetBrains_Mono, Noto_Sans_Georgian } from "next/font/google";
```

Delete the `const manrope = Manrope({...})` block, keep the other two exactly as they are, and add:

```ts
import { SettingsStyle } from "@/components/layout/settings-style";
import { getSiteSettings } from "@/lib/queries/settings";
import { fontClassNames } from "@/lib/settings/fonts";
```

- [ ] **Step 3: Read settings and apply them**

Replace the body of `LocaleLayout` (lines 104-129) with:

```tsx
export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Opts this layout's subtree into static rendering for the resolved locale.
  setRequestLocale(locale);

  // Never throws: on any failure it returns the defaults, because an error here
  // would take down every page rather than one component.
  const settings = await getSiteSettings();

  return (
    <html
      lang={locale}
      className={`${fontClassNames()} ${notoGeorgian.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <SettingsStyle settings={settings} />
      </head>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <SiteHeader locale={locale as Locale} settings={settings} />
          <main className="flex-1">{children}</main>
          <SiteFooter locale={locale as Locale} settings={settings} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

`SiteHeader` and `SiteFooter` do not accept a `settings` prop yet — Task 6 adds it. This step will not typecheck on its own; that is expected, and Task 6 closes it. Do not commit between the two.

- [ ] **Step 4: Complete Task 6 before verifying**

Proceed to Task 6, then run the checks and the commit at the end of it. This task and the next are one commit.

---

### Task 6: Contact details reach the storefront

**Files:**
- Modify: `components/layout/site-header.tsx:19` and its `PHONE` uses at `:63`, `:67`, `:76`
- Modify: `components/layout/site-footer.tsx:10` and its uses at `:67`, `:71`, `:74`, `:76`
- Modify: `app/[locale]/p/[slug]/page.tsx:33`, `:191`, `:198`

**Interfaces:**
- Consumes: `ResolvedSettings` and `getSiteSettings`.
- Produces: `SiteHeader` and `SiteFooter` both take `settings: ResolvedSettings` alongside `locale`.

- [ ] **Step 1: Header**

In `components/layout/site-header.tsx`, delete `const PHONE = "+995 322 40 40 40";` (line 19), add the type import, and change the signature:

```tsx
import type { ResolvedSettings } from "@/lib/settings/defaults";

export async function SiteHeader({
  locale,
  settings,
}: {
  locale: Locale;
  settings: ResolvedSettings;
}) {
```

Then replace the three `PHONE` references with `settings.phone` — the `tel:` href at line 63, the displayed number at line 67, and the `phone` prop passed to `MobileNav` at line 76. Keep the existing `.replace(/\s/g, "")` on the href.

- [ ] **Step 2: Footer**

In `components/layout/site-footer.tsx`, delete `const PHONE` (line 10), add the same type import and prop, and replace:

- line 67 `tel:${PHONE...}` → `tel:${settings.phone.replace(/\s/g, "")}`
- line 71 `{PHONE}` → `{settings.phone}`
- line 74 `{t("footer.address")}` → `{pickLocale(settings.address, locale)}`
- line 76 `{t("footer.workHours")}` → `{pickLocale(settings.workHours, locale)}`

`pickLocale` is already imported in this file. Then add the email row directly after the address `<li>`, before the working-hours one:

```tsx
            {settings.email ? (
              <li>
                <a
                  href={`mailto:${settings.email}`}
                  className="hover:text-white inline-flex items-center gap-2 transition-colors"
                >
                  <Mail aria-hidden className="size-4 shrink-0" />
                  {settings.email}
                </a>
              </li>
            ) : null}
```

Extend the lucide import on line 1 to `import { Mail, MapPin, Phone } from "lucide-react";`. The row renders only when the field is set — there is no email on the site today, so an empty value must leave the footer exactly as it is.

- [ ] **Step 3: Product page**

In `app/[locale]/p/[slug]/page.tsx`, delete `const PHONE` (line 33), add `import { getSiteSettings } from "@/lib/queries/settings";`, and read it in the page function alongside whatever it already awaits:

```tsx
  const settings = await getSiteSettings();
```

Then replace the `tel:` href at line 191 with `tel:${settings.phone.replace(/\s/g, "")}` and the displayed number at line 198 with `{settings.phone}`. This page is not passed the prop because it is not a child of the layout's component tree in the prop sense — the `cache()` on `getSiteSettings` means this costs no extra query.

- [ ] **Step 4: Typecheck, lint and build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: no errors. The build also proves the `next/font` rewiring in Task 5 is valid.

- [ ] **Step 5: Check the site still looks unchanged**

With no settings document saved yet, run `npm run dev` and open `http://localhost:3000/ka`. The header phone, the footer address and the working hours must read exactly as before, and no email row appears. Any visible change here means a default is wrong, not that the feature works.

- [ ] **Step 6: Commit Tasks 5 and 6 together**

```bash
git add app/[locale]/layout.tsx components/layout/settings-style.tsx components/layout/site-header.tsx components/layout/site-footer.tsx app/[locale]/p/[slug]/page.tsx
git commit -m "feat: serve contact details and the theme from settings

The phone number was declared three separate times and could drift; the address
and working hours were copy in the message files rather than data. All of them now
come from one read, which falls back to exactly what the site showed before.

The colour and font overrides are injected inline in <head> so they apply before
first paint — a stylesheet request or a client effect would both paint the default
palette first and then correct it."
```

---

### Task 7: The admin page

**Files:**
- Modify: `app/admin/layout.tsx:1`, `:23-30`
- Create: `app/admin/settings/page.tsx`, `components/admin/settings-form.tsx`

**Interfaces:**
- Consumes: `getSiteSettings`, `ResolvedSettings`, `FONTS`, the PATCH contract from Task 4.
- Produces: `<SettingsForm settings={ResolvedSettings} />`.

- [ ] **Step 1: Nav entry**

In `app/admin/layout.tsx`, extend the icon import on line 1 with `Settings` and add as the last `NAV` entry:

```ts
  { href: "/admin/settings", label: "Site settings", icon: Settings },
```

- [ ] **Step 2: The page**

Create `app/admin/settings/page.tsx`:

```tsx
import { SettingsForm } from "@/components/admin/settings-form";
import { getSiteSettings } from "@/lib/queries/settings";

export default async function AdminSettingsPage() {
  const settings = await getSiteSettings();

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-display text-2xl">Site settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Contact details, brand colours and the typeface. Clearing a field restores its
          default.
        </p>
      </header>

      <SettingsForm settings={settings} />
    </div>
  );
}
```

- [ ] **Step 3: The form**

Create `components/admin/settings-form.tsx`. It follows `components/admin/brand-form.tsx` — local draft state, per-field errors keyed by the API's `{field: code}` contract, disabled submit while pending.

```tsx
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
            className="h-10"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`hours-${locale}`}>Working hours</Label>
          <Input
            id={`hours-${locale}`}
            value={draft.workHours[locale] ?? ""}
            onChange={(event) => setDraft({ ...draft, workHours: { ...draft.workHours, [locale]: event.target.value } })}
            className="h-10"
          />
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
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/admin/layout.tsx app/admin/settings components/admin/settings-form.tsx
git commit -m "feat: site settings admin page

One form over three groups. The colour section previews the button, badge and
header bar in the pending colour before saving, so the contrast refusal is never
the first time an operator learns the choice does not work."
```

---

### Task 8: Verification pass

**Files:**
- Modify: `scripts/verify-settings.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: no new exports.

- [ ] **Step 1: Add the font-key check**

The API refuses a `fontKey` outside the allowlist, and `findFont` falls back rather than throwing. Lock both in. Append inside the `try` block of `scripts/verify-settings.ts`:

```ts
    const { FONT_KEYS, findFont } = await import("../lib/settings/fonts");
    check("the default font key is in the allowlist", FONT_KEYS.includes("manrope"));
    check("an unknown key falls back rather than throwing", findFont("no-such-font").key === FONT_KEYS[0]);
```

- [ ] **Step 2: Run the script twice**

Run: `npm run verify:settings`
Expected: `22 checks passed`, and the pre-existing settings document restored. Run it a second time — a clean second run proves the snapshot-and-restore worked.

- [ ] **Step 3: Browser pass**

With `npm run dev` running and signed in as an admin, record each result:

1. `/admin/settings` renders with the current values pre-filled from the defaults.
2. Change the phone; it updates in the header, the footer and a product page, and the `tel:` href has no spaces.
3. Set an email; a footer row appears with a working `mailto:`. Clear it; the row disappears.
4. Set a Georgian address; `/ka` shows it while `/en` and `/ru` still show their defaults.
5. Set all three working-hours locales; each renders on its own locale.
6. Set brand yellow to `#333333` → refused inline, naming the measured ratio, and the preview strip already showed black-on-dark.
7. Set brand yellow to `#ffd800` → saves; the sale badge and quote button pick it up on the storefront with no flash of the old colour on load.
8. Set brand black to `#1a2b3c` → the header and footer backgrounds change.
9. Enter `red` in a colour field → refused with the hex message.
10. Switch the typeface to Inter → body and headings change on `/en`; on `/ka` the Georgian text still renders through Noto Sans Georgian.
11. Clear every field and save → the site is byte-for-byte its original appearance, and `<head>` contains no injected `<style>` block.
12. Sign out and load a page → the storefront still renders with the saved theme.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-settings.ts
git commit -m "test: cover the font allowlist fallback

An unknown key must resolve to the default rather than throw: the key is read on
every page render, so a stale value after a face is removed from the list would
otherwise take the site down."
```

---

## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| `SiteSettings` singleton, all fields optional | 1 |
| `DEFAULT_SETTINGS`, one place for fallbacks | 1 |
| `getSiteSettings`, `cache()`-wrapped, never throws | 1 |
| Message keys retained as localized defaults | 1 (values copied into `DEFAULT_SETTINGS`) |
| Inline `<style>` in `<head>`, only the diffs | 5 |
| Derived hover shade, light and dark | 2 (maths), 5 (emission) |
| Contrast guard at 4.5:1, ratio reported | 2 (maths), 4 (enforcement), 7 (message) |
| Hex-only validation | 2 (regex), 4 (schema) |
| Font allowlist, seven named faces, `preload: false` | 3 |
| `--font-body` indirection so the swap reaches the utilities | 3 |
| Phone from settings in three consumers | 6 |
| Address and working hours from settings, `pickLocale` | 6 |
| New footer email row, hidden when empty | 6 |
| `PATCH /api/admin/settings`, no POST/DELETE | 4 |
| Admin page, three sections, live colour preview | 7 |
| Spec test items 1-7 | 1, 2, 8 |
| Spec test items 8-13 | 8 (browser pass) |

**Type consistency**

`ResolvedSettings` is defined once in Task 1 and consumed unchanged in Tasks 5, 6 and 7. `FontEntry.variable` holds a CSS variable *name* (`--font-inter`) and is used as `var(${entry.variable})` in Task 5 — the `var(...)` wrapper is applied at the use site, not stored. `derivedShades` returns `{light, dark}` in Task 2 and is destructured as such in Tasks 5 and 7. The API's `{fields, ratio}` shape in Task 4 matches what Task 7's form reads.

**Known forks left to the implementer**

Task 3 Step 1 is a real fork with both branches specified: the implementer inspects the compiled CSS to learn whether Tailwind's `@theme inline` substituted the font token's value, and Task 5 Step 1 carries the alternate wording for the other branch. Task 1 Step 4 carries a documented fallback if React's `cache()` memo defeats the second read inside a single script process.

**One thing this plan does not do**

It does not mount a `ThemeProvider`. Dark mode is dormant in this repo — nothing applies the `.dark` class — so the emitted `.dark` override is inert until that changes. Switching dark mode on is its own piece of work.
