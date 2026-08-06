# Strong Wash

Trilingual (KA / EN / RU) catalogue for **professional car wash equipment** — rollover and tunnel systems, self-service bays, high-pressure washers, water treatment, chemicals and spare parts. Layout structured after gorgia.ge.

This is **B2B capital equipment**, and the UI reflects that: the product CTA is *request a quote* rather than add-to-cart, systems carry a build lead time instead of a stock count, and the card spec strip leads with the numbers an operator specifies against (throughput, vehicle envelope, power draw).

**Phase 1 of [plan.md](plan.md) is complete: the frontend, running entirely on mock data. No database is required to run it.**

## Run it

```bash
npm install
npm run dev
```

Open <http://localhost:3000> — `/` redirects to `/ka`. Locales: `/ka`, `/en`, `/ru`.

Other scripts:

```bash
npm run build                              # production build (typechecks + prerenders)
npm run lint                               # eslint
node scripts/generate-placeholders.mjs     # regenerate placeholder artwork
```

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router, RSC, Turbopack) + React 19 |
| Styling | Tailwind CSS v4 + shadcn/ui (Radix) |
| i18n | next-intl 4, `[locale]` segment, locale detection in `proxy.ts` |
| Data | In-memory fixtures under `lib/mock/` |

## Brand

The palette is sampled from the supplied logo artwork, not invented: the mark uses exactly **`#fec303`** (yellow) and **`#010101`** (black), and everything else in `app/globals.css` is a neutral derived from those two.

Assets in `public/brand/` are cropped from the original artwork — no redraw:

| File | Use |
|---|---|
| `logo-lockup.png` | Header, footer, homepage cover (1024×413, transparent) |
| `logo-mark.png` | Mark only, no wordmark (512×175) |
| `*-inverse.png` | Dark surfaces — the black ink is remapped to white, the yellow is untouched |
| `og-cover.png` | Social/Open Graph card (1200×630) |
| `app/icon.png` | Favicon: mark on white, so it survives light *and* dark browser chrome |

Two rules the components follow:

- **Yellow never carries text.** It has no legible contrast against white, so black owns body copy and primary buttons; yellow is used as a *field* behind black text (discount badges, the product CTA) and for active states. Prices are always near-black — a discount is signalled by the yellow badge and the struck-through original, never by recolouring the number.
- **Section accents reuse the logo's shear.** The mark is drawn in oblique projection, so accent rules use the same angle (`.oblique-rule` / `.oblique-band`) rather than an unrelated decorative shape.

### The lari sign is drawn, not typed

`components/ui/lari.tsx` renders ₾ as an SVG outline instead of the character U+20BE. No Google webfont ships a `unicode-range` covering it, and it is missing from the system fonts on a stock Windows install — Chrome then resolves it through an emoji font and renders **a hard-hat pictograph where the price should be**. The outline is extracted from Noto Sans Regular (SIL OFL 1.1). Plain-text contexts that cannot hold an element (JSON-LD, `aria-label`, metadata) use `formatPriceText()`, which emits the ISO code `GEL`.

## What works

- **Home** — hero with a live product card, category tiles, featured, on-sale, brands, benefits
- **Category listing** (`/c/[...slug]`) — faceted filtering, sorting, pagination, subcategory chips, breadcrumbs
- **Product detail** (`/p/[slug]`) — gallery, key specs, price/stock, description/specs/delivery tabs, related products, Product JSON-LD
- **Search** (`/search`) — same grid and facets, scoped across the whole catalogue
- All three locales throughout, including a Georgian-first font stack and 404 page

### Filtering

**All filter state lives in the URL**, so any filtered view is shareable and server-rendered:

```
/ka/c/high-pressure-washers?brand=karcher,ehrle&price=10000-25000
  &spec.pressure=150-500&spec.waterTemp=hot&inStock=1&sort=price_asc&page=2
```

Two behaviours worth knowing, because they are the parts that are easy to get wrong later:

1. **Multiple spec filters AND together.** `waterTemp=hot&voltage=230v` returns 0 even though each alone returns results — the constraints are matched per spec entry, not across the array. Phase 2 must reproduce this with one `$elemMatch` per key.
2. **Each facet's counts exclude its own dimension.** Selecting *Kärcher* leaves the other manufacturers clickable with real counts, instead of showing 0 for everything unselected.
3. **"In stock" excludes built-to-order.** A ten-week-lead-time gantry is neither in stock nor unavailable, so `inStock=1` returns 0 under *Automatic wash systems* and 6 under *Spare parts* — see `isHeldInStock()`.

Category spec schemas are **inherited** — "Throughput" is declared once on `automatic-systems` and filters on `/rollover-machines` too. Facets with no matching data are omitted automatically, which is why `Brush count` appears under Rollover machines but not under Tunnel systems.

## Layout

```
app/[locale]/          routes (root layout lives here)
  c/[...slug]/         category listing
  p/[slug]/            product detail
  search/
components/
  catalog/             cards, grid, filters, spec strip, price block
  layout/              header, mega-menu, footer, mobile nav, locale switcher
  product/             gallery
  ui/                  shadcn
i18n/                  next-intl routing, navigation, request config
lib/
  mock/                brands, categories, products  ← swapped for Mongoose in Phase 2
  queries/             filtering + facet building, URL ↔ query parsing
  types.ts             shared types, mirroring the Phase 2 documents
messages/              ka.json, en.json, ru.json (UI chrome only)
proxy.ts               locale detection (Next 16 renamed middleware → proxy)
```

`lib/mock/` and `lib/queries/products.ts` are the seam: `lib/types.ts` already matches the intended Mongoose documents, so Phase 2 replaces the fixtures and the query implementation without touching a single component.

## Deviations from plan.md

| Plan | Built | Why |
|---|---|---|
| Next.js 15 | Next.js 16.3 | Current release. Middleware is now `proxy.ts`; `params`/`searchParams` are async |
| Product carousels on home | Static grids | Same content, no client JS. Carousels can come back if wanted |
| Real product photography | Generated SVG placeholders | 21 files from `scripts/generate-placeholders.mjs`, three variants per family so the gallery is testable; drawn in the brand palette |
| Invented palette (teal/navy) | Palette sampled from the logo | The brand artwork arrived after the first pass — see **Brand** above |
| Per-product long copy | Composed from the short description | Real copy is an admin-panel (Phase 4) concern |

## Not in this phase

No cart, no checkout, no orders, no accounts — by design (see the scope table in [plan.md](plan.md)). Product pages end at a *request a quote* CTA, which suits capital equipment: configuration and price depend on the site.

Worth considering before Phase 2, given the B2B shape:

- **A quote-request form** (equipment + site details) instead of a bare phone CTA — this is the real conversion action, and it needs a `QuoteRequest` collection.
- **`priceOnRequest`** on `Product`. Large installations are quoted, not listed; a nullable price is one field and stops a 720,000 ₾ figure standing in for a real proposal.
- **Reference installations** — operators buy on evidence of comparable sites.

Next up is **Phase 2: MongoDB Atlas + Mongoose**. Review the `Product` and `Category` schemas before seeding: changing them after trilingual data entry begins is expensive.
