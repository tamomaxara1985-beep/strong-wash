# Admin site settings — contact details, brand colours, fonts

Date: 2026-08-09

## Problem

Three things an operator would reasonably expect to change are compiled in:

- The phone number is `const PHONE = "+995 322 40 40 40"`, declared separately in
  `components/layout/site-header.tsx:19`, `components/layout/site-footer.tsx:10` and
  `app/[locale]/p/[slug]/page.tsx:33`. Changing it means editing three files and
  redeploying, and the three can drift.
- The address and working hours live only in the message files as
  `footer.address` and `footer.workHours`, translated per locale. They are copy,
  not data.
- The brand colours and the typeface are CSS custom properties and `next/font`
  loader calls in `app/globals.css` and `app/[locale]/layout.tsx`.

There is no contact email anywhere on the site.

## Scope

One `/admin/settings` section with three field groups — Contact, Colours,
Typography — backed by a single `SiteSettings` document.

Out of scope: the ~45 semantic colour tokens (`--background`, `--muted`,
`--border`, and the rest). `globals.css` documents them as neutrals derived from
the two brand colours so nothing competes with the logo; exposing them would mean
a contrast check on every pair and a realistic way to make the site unreadable.
Only the brand colours are editable. The mono typeface is also fixed — spec
tables, SKUs and prices are not a branding surface.

## Data model

One document, one fixed `_id`, upserted on save. A collection that can only ever
hold one row is the simplest thing that survives a concurrent save.

```ts
type SiteSettings = {
  phone?: string;
  email?: string;
  address?: LocalizedString;      // ka required when present, en/ru optional
  workHours?: LocalizedString;
  brandYellow?: string;           // #rrggbb
  brandBlack?: string;            // #rrggbb
  fontKey?: string;               // a key from the FONTS allowlist
};
```

**Every field is optional and every read falls back to what the site shows
today.** This is load-bearing, not defensive habit: the settings document is read
in the root layout, so it is on the path of every single page. A missing document,
a first deploy against an empty database, or an unreachable Atlas must degrade to
the current site rather than to a blank one. The fallbacks live in one
`DEFAULT_SETTINGS` constant in `lib/settings/defaults.ts`, so "what the site looks
like with no settings row" is one file, not a scatter of `??` operators.

The existing `footer.address` and `footer.workHours` message keys stay exactly as
they are and serve as the localized defaults, so nothing changes visually before
the first save.

## Reads

`getSiteSettings(): Promise<ResolvedSettings>` in `lib/queries/settings.ts`,
`cache()`-wrapped so the layout, header, footer and product page share one query
per request. It merges the stored document over `DEFAULT_SETTINGS` and returns a
fully-populated object — every consumer gets a value, and no consumer writes its
own fallback.

No Next data-cache tag and no revalidation plumbing. The document is a handful of
fields fetched by `_id`; a stale theme after a save would be a worse failure than
one extra millisecond per render.

If the query throws, `getSiteSettings` logs and returns `DEFAULT_SETTINGS`. A
database blip must not take the whole site down, which it would if the root layout
propagated the error.

## Colours

### Delivery

The root layout renders a `<style>` block in `<head>` containing only the
declarations that differ from the defaults:

```css
:root { --brand-yellow: #…; --brand-yellow-dark: #…; --brand-black: #…; }
.dark { --brand-yellow-dark: #…; }
```

Two stored values produce four declarations. Everything else in `globals.css` is
untouched. Being in `<head>` and inline, it applies before first paint — no flash
of the default palette.

`--brand-yellow-dark` is computed, not stored: the yellow darkened for light mode
and lightened for dark mode, matching the ratio `globals.css` hand-tuned today
(`#fec303` → `#e0a800` light, `#ffd23f` dark). A third input for a hover shade
would be a field nobody can reason about.

### The legibility guard

`--brand-yellow` carries black text everywhere it appears — badges, sale tags, and
the primary button in dark mode, where `--primary` *is* the brand yellow. A dark
brand colour therefore produces black-on-dark text with nothing failing loudly.

On save the API computes the WCAG relative-luminance contrast ratio of each brand
colour against the foreground actually painted on it, and refuses anything below
4.5:1, returning `422 { fields: { brandYellow: "low_contrast" }, ratio: 3.1 }` so
the form can say *3.1:1, needs 4.5:1*.

The form shows a live preview before saving — a primary button, a sale badge and a
header bar rendered in the pending colour — so a refusal is never the first
warning.

### Validation

Hex only, `^#[0-9a-fA-F]{6}$`. No `oklch`, no `rgb()`, no gradients, no shorthand.
Beyond keeping the computation simple, a strict regex is what keeps the injected
CSS from containing anything that could terminate the declaration and inject rules
of its own.

## Fonts

`next/font/google` is statically analysed at build time: a family name read from
the database cannot be passed to it. So the choice is *which* preloaded family the
CSS variables resolve to, not which family exists.

A `FONTS` array in `lib/settings/fonts.ts`, each entry carrying a key, a display
name, the loader call, and the CSS variable it exposes. All loaders run at module
scope, so every face is still self-hosted and analysed normally. `--font-sans` and
`--font-heading` resolve to the chosen entry's variable; the Georgian and mono
stacks are appended exactly as `globals.css` does today.

Every candidate is vetted before it enters the array. Faces without Mkhedruli
coverage are not disqualified — Manrope has none today, and Noto Sans Georgian is
stacked behind it per glyph. What the array must not contain is a face whose
Georgian fallback reads at a visibly different weight or x-height from its Latin.

Starting set, all on Google Fonts and all variable-weight: **Manrope** (the current
default), **Inter**, **Figtree**, **Plus Jakarta Sans**, **Source Sans 3**,
**Rubik**, and **Archivo**. Seven entries spanning geometric, grotesque and
humanist. Source Sans 3 and Rubik carry their own Georgian glyphs; the rest fall
through to Noto Sans Georgian exactly as Manrope does today, which is why that
stack stays appended for every entry rather than only for the ones that need it.
The mono face stays JetBrains Mono.

Cost of an allowlist: every listed family is in the build whether chosen or not,
since the loaders cannot be conditional. Non-default faces are declared with
`preload: false`, so the browser downloads only the family the CSS actually
references — the cost is build size, not page weight. That is why the list is
six to eight entries and not forty.

Adding a face later is a code change plus a deploy. That is inherent to
`next/font`, and it is the price of self-hosting.

## Contact details

The three `const PHONE` declarations are deleted. The header, footer and product
page take the value from settings — one string used for both the displayed number
and the `tel:` href, with whitespace stripped for the href as the current code
already does.

The footer stops calling `t("footer.address")` and `t("footer.workHours")` and
reads the localized settings values, resolved through the existing `pickLocale`.
The message keys remain as the defaults.

Email is new: a row in the footer contact block beside the address, a `mailto:`
link, rendered only when the field is set. Nothing else on the site gains an email.

## API

`PATCH /api/admin/settings` — `assertSameOrigin` then `requireAdmin`, as every
admin handler does. `settingsSchema` in `lib/auth/schemas.ts` validates; the
contrast guard runs after parsing; the document is upserted by its fixed `_id`.
Returns `200 { ok: true }`.

There is no POST and no DELETE. A singleton is created by its first save and has
no meaningful delete — clearing a field back to empty restores its default, which
is the same thing an operator would mean by "remove it".

## Admin page

`/admin/settings`, a nav entry after Users in `app/admin/layout.tsx`. One form,
three sections, one save button:

- **Contact** — phone, email, and address and working hours behind the same
  ka/en/ru locale tabs the brand and category forms use.
- **Colours** — two `type="color"` inputs each paired with a hex text field, and
  the live preview strip described above.
- **Typography** — a select of the allowlist, each option previewed in its own
  face.

Empty means "use the default", stated on the page rather than left to be
discovered.

## Testing

No test runner exists in this repository; `/admin/brands` and `/admin/categories`
both shipped verified by a script plus a browser pass, and this follows that
practice.

`scripts/verify-settings.ts`:

1. With no document, `getSiteSettings()` returns a fully-populated object equal to
   `DEFAULT_SETTINGS`.
2. With a partial document, unset fields still come back populated and set fields
   win.
3. Saving twice upserts rather than creating a second document.
4. The contrast guard accepts a colour at 4.5:1 and refuses one just below it,
   reporting the measured ratio.
5. The hex regex refuses `red`, `#ff0`, `#GGGGGG` and `#fff);body{display:none`.
6. A localized field with only `ka` set falls back to the admin's stored `ka`
   for en and ru, and a field with nothing stored at all still falls back to
   the default.
7. `getSiteSettings` returns `DEFAULT_SETTINGS` rather than throwing when the
   query fails.

Browser pass:

8. Changing the phone updates the header, the footer and a product page, and the
   `tel:` href matches.
9. Address, working hours and email render in all three locales, with the email
   row absent when the field is empty.
10. A new brand yellow reaches the badge, the sale tag and the dark-mode primary
    button, with no flash of the old colour on load.
11. A new brand black reaches the footer and header backgrounds.
12. Switching the font changes body and heading text in all three locales, and
    Georgian text still renders through the Noto fallback.
13. Clearing every field returns the site to its current appearance exactly.
