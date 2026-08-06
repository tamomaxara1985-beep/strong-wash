# Strong Wash — Technical Implementation Plan

Catalogue for professional car wash equipment — rollover and tunnel systems, self-service bays, high-pressure washers, water treatment, chemicals and spare parts. Structurally modeled on gorgia.ge.

**This is B2B capital equipment.** Systems are quoted and built to order, not added to a cart, which shapes the CTA, the availability model and the spec surface throughout.

**Stack:** Next.js 15 (App Router, TypeScript) · Tailwind CSS v4 · shadcn/ui · Mongoose + MongoDB Atlas · next-intl (KA/EN/RU) · Voyage AI embeddings + Atlas Vector Search · Auth.js (admin only)

---

## Scope decisions

| Decision | Choice | Consequence |
|---|---|---|
| Catalog | Professional car wash equipment (~100–500 SKUs): automatic systems, self-service, high-pressure, vacuum, water treatment, chemicals, foam/dosing, dryers, spare parts | Shallow tree (2–3 levels), aggregation-based facets are fast enough — no dedicated search engine needed for filtering |
| v1 features | Catalog + faceted filters only | **No cart, no checkout, no orders.** Product pages end at a "request a quote" CTA — the correct action for quoted capital equipment |
| Languages | KA + EN + RU from day one | Every user-facing field is a `{ka, en, ru}` subdocument. Non-negotiable in Phase 2 — retrofitting means a data migration |
| AI | Semantic / natural-language search | Requires **MongoDB Atlas** (M10+ for vector search), not local or self-hosted Mongo |
| Content entry | In-app admin panel | Built in Phase 4. Phase 2 ships a seed script so the catalog works before the panel exists |
| Auth | Admin only | Single role, credentials login, protects `/admin`. Customers have nothing to log in for in v1 |
| Filter architecture | Typed attribute array + Mongo `$facet` aggregation | New spec types need no schema change |
| Design | Mirror gorgia.ge structure, own colors | Dense header, mega-menu category nav, grid product cards, left-rail filters |

### Flagged risks

1. **Trilingual content is a 3× data-entry cost per product.** The admin panel (Phase 4) should offer AI-assisted translation to make this survivable at scale. Not in v1 scope, but design the admin forms so it can be added.
2. **Georgian is weakly represented in every commercial embedding model.** Phase 3 mitigates this by normalizing queries to English via Claude before embedding, and embedding the English product text. See Phase 3 for detail.
3. **Phase ordering puts AI before the admin panel** (per requested order). This is workable because Phase 2 ships a seed script, but it means semantic search is tuned against seed data rather than real catalog content. Expect a re-embedding pass after the admin panel lands.

---

## Phase 0 — Scaffold

**Goal:** empty app that builds, lints, and runs in three locales.

1. `create-next-app` — TypeScript, App Router, Tailwind v4, ESLint.
2. `shadcn` init. Add baseline components: `button`, `input`, `select`, `checkbox`, `slider`, `sheet`, `dialog`, `dropdown-menu`, `accordion`, `badge`, `skeleton`, `pagination`, `breadcrumb`, `card`, `form`, `label`, `separator`, `tabs`, `table`, `toast`.
3. `next-intl` with `[locale]` route segment. Locales `ka` (default) / `en` / `ru`. Middleware for locale detection and redirect.
4. Message files `messages/{ka,en,ru}.json` — UI chrome strings only (product content lives in the DB).
5. Design tokens in `app/globals.css` — brand palette, typography scale, spacing. Dark mode via `class` strategy.
6. Prettier + `tailwind-merge` + `clsx` helper (`cn()`).

**Directory shape:**

```
app/
  [locale]/
    page.tsx                    home
    c/[...slug]/page.tsx        category listing + filters
    p/[slug]/page.tsx           product detail
    search/page.tsx             search results
    layout.tsx
  admin/                        Phase 4, unlocalized
  api/
lib/
  db.ts                         mongoose connection (cached)
  models/
  i18n/
components/
  layout/                       header, mega-menu, footer, mobile-nav
  catalog/                      product-card, product-grid, filter-rail, sort-select
  product/                      gallery, spec-table, price-block
  ui/                           shadcn
messages/
scripts/                        seed, reindex
```

**Done when:** `/ka`, `/en`, `/ru` all render a placeholder home page; locale switcher works; build passes.

---

## Phase 1 — Frontend (mock data)

**Goal:** every page pixel-complete and interactive against typed mock fixtures. No database yet.

Build against a `lib/mock/` module exporting the exact shapes Phase 2 will return, so swapping in real data is a one-import change.

### Pages and components

**Header** (mirrors gorgia.ge's dense pattern)
- Utility bar: locale switcher, phone, store locator link
- Main bar: logo, search input (autocomplete-ready), wishlist/compare placeholders
- Category bar: horizontal top-level categories opening a mega-menu panel with subcategories + promo slot
- Mobile: hamburger → `Sheet` with accordion category tree

**Home**
- Hero slider
- Category tile grid
- "Featured" and "On sale" product carousels
- Brand strip
- Trust/benefits row

**Category listing** — `/c/[...slug]`
- Breadcrumb, category title + description, subcategory chips
- Left filter rail (desktop) / bottom `Sheet` (mobile):
  - Price range `Slider` with numeric inputs
  - Brand checkbox list with counts, searchable when long
  - Per-category spec facets: enum → checkbox list, number → range, bool → toggle
  - Availability toggle
  - Active-filter chip row with individual and clear-all removal
- Sort select: relevance, price ↑/↓, newest, name
- Product grid, responsive 2/3/4 columns
- Pagination (URL-driven, not infinite scroll — SEO)
- `Skeleton` loading states, empty state with filter-relaxation suggestions

**Product detail** — `/p/[slug]`
- Image gallery: thumbnails, zoom, mobile swipe
- Title, brand, SKU, price block (regular / sale / discount badge), stock badge
- CTA: "Request a quote" (no cart in v1; configuration and price depend on the site)
- Tabbed: description, full spec table, delivery info
- Related products (same category)

**Search results** — `/search`
- Same grid + filter rail as category, plus a "no results" path that will later feed semantic fallback

### State management

**All filter state lives in the URL query string** — no client store. This is load-bearing:
- shareable and bookmarkable filtered views
- server components can read `searchParams` and render filtered results without hydration
- back/forward navigation works for free
- Phase 2 API routes consume the same parameter shape

Query contract (define now, honor in Phase 2):

```
/ka/c/high-pressure-washers?brand=karcher,ehrle&price=10000-25000
  &spec.pressure=150-500&spec.waterTemp=hot&inStock=1&sort=price_asc&page=2
```

**Done when:** all pages render and interact correctly in all three locales with mock data; filter changes update the URL and re-render the grid; responsive down to 360px; no horizontal page scroll.

---

## Phase 2 — Backend + Mongoose

**Goal:** replace mocks with real Atlas data behind API routes.

### Connection

`lib/db.ts` — cached global connection to survive Next.js hot reload and serverless invocation reuse. `MONGODB_URI` in `.env.local`, never committed.

### Localized field helper

```ts
const localizedString = {
  ka: { type: String, required: true, trim: true },
  en: { type: String, trim: true },
  ru: { type: String, trim: true },
};
```

Georgian required, EN/RU optional with fallback to `ka` at read time via a `pickLocale(field, locale)` helper.

### `Brand`

`slug` (unique), `name`, `logo`, `description: localizedString`, `order`, `isActive`.

### `Category`

```
slug          String, unique, indexed
name          localizedString
description   localizedString
parent        ObjectId → Category | null
ancestors     [ObjectId]        // materialized path, root → parent
path          String            // "/automatic-systems/rollover-machines"
image, icon
order, isActive
specSchema    [SpecDefinition]  // drives which facets render for this category
```

`ancestors` is what makes "all products anywhere under Automatic wash systems" a single indexed query instead of a recursive tree walk. Maintained by a pre-save hook that recomputes from `parent`.

`SpecDefinition` — the facet contract:

```
key          String            // "throughput", "pressure", "waterTemp"
label        localizedString
type         'number' | 'enum' | 'bool'
unit         String            // "kg", "rpm"
options      [{ value: String, label: localizedString }]   // enum only
filterable   Boolean
showInCard   Boolean
order        Number
```

Spec definitions are inherited: a category's effective schema is its own `specSchema` merged with all ancestors'. This means "Brand" and "Price" live once at the root and every leaf gets them.

### `Product`

```
sku                  String, unique
slug                 String, unique, indexed
name                 localizedString
shortDescription     localizedString
description          localizedString
brand                ObjectId → Brand
category             ObjectId → Category      // leaf
categoryAncestors    [ObjectId]               // denormalized from category
price                Number                   // GEL, minor units avoided — store as decimal GEL
salePrice            Number | null
stock                Number
stockStatus          'in_stock' | 'low' | 'out' | 'preorder'
images               [{ url, alt: localizedString, order }]
specs                [ProductSpec]
searchText           localizedString          // denormalized name + brand + key specs
embedding            [Number]                 // Phase 3, 1024-dim
embeddingUpdatedAt   Date
isActive, isFeatured
createdAt, updatedAt
```

`ProductSpec` — typed values in one array:

```
key           String
valueNumber   Number    // type: 'number'
valueString   String    // type: 'enum' — matches SpecDefinition.options[].value
valueBool     Boolean   // type: 'bool'
```

Separate typed fields rather than a single polymorphic `value` — this lets `$gte`/`$lte` range queries work on numbers without per-document casting, and keeps the index on `specs.valueNumber` useful.

### Indexes

```
{ slug: 1 }                                        unique
{ sku: 1 }                                         unique
{ categoryAncestors: 1, isActive: 1, price: 1 }
{ categoryAncestors: 1, brand: 1, isActive: 1 }
{ 'specs.key': 1, 'specs.valueNumber': 1 }
{ 'specs.key': 1, 'specs.valueString': 1 }
{ isFeatured: 1, isActive: 1 }
```

Atlas Search index (text) and Atlas Vector Search index (embedding) are defined in Phase 3.

### Faceted query — the core piece

One aggregation returns products, total count, and all facet counts. Shape:

```
[
  { $match: baseFilter },              // category subtree + isActive + non-facet filters
  { $facet: {
      products: [ { $sort }, { $skip }, { $limit }, { $lookup: brand }, { $project } ],
      total:    [ { $count: 'n' } ],
      brands:   [ { $group: { _id: '$brand', count: { $sum: 1 } } } ],
      priceRange: [ { $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } } ],
      specFacets: [ { $unwind: '$specs' }, { $group: { _id: { key, value }, count } } ]
  }}
]
```

**Two correctness details that are easy to get wrong:**

1. **Multi-spec AND filtering needs `$and` of `$elemMatch`.** Filtering "pressure 150–500 **and** hot water" against a single `specs` array must be:
   ```js
   { $and: [
       { specs: { $elemMatch: { key: 'pressure', valueNumber: { $gte: 150, $lte: 500 } } } },
       { specs: { $elemMatch: { key: 'waterTemp', valueString: { $in: ['hot'] } } } },
   ]}
   ```
   A flat `{ 'specs.key': 'pressure', 'specs.valueNumber': {...} }` matches if *any* element has the key and *any* element has the value — a false positive.

2. **Facet counts should exclude their own dimension.** A brand facet computed under the full filter (including the brand filter) shows count 0 for every unselected brand, making them unclickable. Compute each facet's counts against the filter set *minus that facet*. With a small catalog, running the aggregation once per facet dimension is acceptable; revisit if p95 latency exceeds ~200ms.

### API routes

| Route | Purpose |
|---|---|
| `GET /api/categories` | Full tree for mega-menu, cached |
| `GET /api/categories/[slug]` | Category + inherited effective spec schema |
| `GET /api/products` | Faceted listing. Consumes the Phase 1 query contract verbatim |
| `GET /api/products/[slug]` | Detail + related |
| `GET /api/search/suggest` | Header autocomplete (prefix match, Phase 2) |

Server components call the query layer in `lib/queries/` directly — no self-fetch over HTTP. API routes exist for the client-side filter interactions and the admin panel.

### Seed script

`scripts/seed.ts` — reads `data/*.json`, upserts brands → categories (computing `ancestors`) → products, validating each product's `specs` keys against its category's effective schema. Idempotent, keyed on `sku` / `slug`.

**Done when:** every Phase 1 page renders real Atlas data in all three locales; filter combinations return correct products and correct counts; product detail 404s properly on unknown slug.

---

## Phase 3 — AI semantic search

**Goal:** "touchless gantry for a low-ceiling bay" or "foam that works in a brush tunnel" returns relevant equipment.

### Provider

Anthropic does not offer an embeddings endpoint. Embeddings come from **Voyage AI** (`voyage-3.5`), which MongoDB owns — it is the intended pairing for Atlas Vector Search. Claude (`claude-opus-5`) handles query understanding.

- Model: `voyage-3.5`, `output_dimension: 1024`, `input_type: "document"` for products / `"query"` for queries
- Cost is negligible at this catalog size (a few hundred documents, re-embedded only on content change)

### The Georgian problem

Georgian has thin representation in every commercial embedding model. Embedding Georgian product text and Georgian queries directly will underperform. The design works around it:

1. Product embedding input is built from the **English** `searchText` (name + brand + category + key specs + short description), falling back to Georgian only when English is absent.
2. Incoming queries pass through Claude, which both classifies intent and emits an English-normalized query string.
3. Only the English string is embedded.

This means the admin panel (Phase 4) should treat the English fields as required-in-practice, even though the schema marks them optional. Worth revisiting once a multilingual model with verified Georgian support is available.

### Atlas indexes

**Vector index** on `products.embedding` — 1024 dimensions, `cosine` similarity, with `category`, `categoryAncestors`, `brand`, `price`, `isActive` declared as filter fields so vector search can be pre-filtered.

**Atlas Search index** on `searchText.ka` / `.en` / `.ru` for lexical matching — exact model names and SKUs must still win on keyword match, which vectors handle poorly.

### Query pipeline

```
user query
  ↓
Claude (claude-opus-5, effort: low, structured output)
  → { intent, normalizedQueryEn, filters: { brand?, priceMax?, specs? } }
  ↓
┌─ vector search ($vectorSearch on embedded normalizedQueryEn, pre-filtered)
└─ lexical search ($search on original query, all three locales)
  ↓
reciprocal rank fusion
  ↓
merge extracted filters into the existing facet pipeline
  ↓
ranked results + "interpreted as: …" chip row (user-removable)
```

Claude call uses structured outputs (`output_config.format` with a JSON schema) so the filter extraction is schema-validated rather than parsed from prose. Adaptive thinking is on by default on `claude-opus-5`; `effort: "low"` keeps this fast enough for interactive search. If latency or cost becomes a problem, `claude-haiku-4-5` is the step-down — your call, not a default I'll make silently.

**Why hybrid rather than pure vector:** a shopper searching `WW90T554DAE` wants exact match. Vector search returns "similar-looking" models. Fusing lexical and vector keeps both behaviors.

### Embedding maintenance

`scripts/reindex.ts` — batch-embeds all products whose `embeddingUpdatedAt` predates `updatedAt`. Called after seeding and (Phase 4) after admin saves. Never block a request on embedding generation.

### UX surfaces

- Header autocomplete upgrades from prefix match to hybrid
- Zero-result category filters offer "did you mean" semantic suggestions
- Search results page shows what the query was interpreted as, with removable filter chips

**Done when:** a set of ~20 natural-language test queries (recorded in `docs/search-evals.md`) returns relevant top-3 results; exact SKU search returns the exact product first; pre-filtered vector search respects category scoping.

---

## Phase 4 — Auth + admin panel

**Goal:** non-technical content entry replaces the seed script.

### Auth

Auth.js v5 with the credentials provider. Single `Admin` model — email, `bcrypt` password hash, name, `lastLoginAt`. No self-registration; the first admin is created by `scripts/create-admin.ts`.

Session strategy: JWT cookie, `httpOnly`, `secure`, `sameSite: lax`. Middleware protects `/admin/*` and `/api/admin/*`.

**Security requirements, not optional:**
- Rate-limit the login route (per-IP and per-account)
- Generic error text on failed login — never reveal whether the email exists
- `bcrypt` cost factor 12 minimum
- CSRF protection on all mutating admin routes (Auth.js provides this — verify it's active)
- Every `/api/admin/*` handler re-checks the session server-side; middleware alone is not authorization
- Image uploads: validate MIME type by content, not extension; cap size; store outside the app directory or on object storage; never trust the client filename

### Admin panel — `/admin` (unlocalized, English UI)

- **Dashboard:** counts, products missing translations, products with stale embeddings
- **Products:** table with search/filter/sort; create and edit form with:
  - Per-locale tabs (KA / EN / RU) for every localized field, with a completeness indicator
  - Category picker that dynamically renders the correct spec inputs from the category's effective `specSchema`
  - Drag-reorder image upload with per-image localized alt text
  - Price, sale price, stock
  - Save triggers a background re-embed
- **Categories:** tree view with drag-reorder; `specSchema` editor (add/remove/reorder spec definitions, manage enum options per locale)
- **Brands:** simple CRUD

The spec-schema editor is the highest-leverage piece — it is what makes "add a new filterable attribute" a content operation rather than a deployment.

**Done when:** a non-developer can add a complete trilingual product with images and specs, and it appears correctly on the storefront with working facets and semantic search.

---

## Phase 5 — Hardening and launch

- **Performance:** ISR / `revalidate` on category and product pages; `next/image` with correct `sizes`; verify aggregation index usage with `explain()`; Core Web Vitals pass on mobile
- **SEO:** per-locale metadata, `hreflang` alternates, canonical URLs, `sitemap.xml` from the live category and product set, `robots.txt`, Product and BreadcrumbList JSON-LD
- **A11y:** keyboard-navigable mega-menu, focus management in filter sheets and dialogs, contrast audit, screen-reader labels on all filter controls
- **Error handling:** `error.tsx` / `not-found.tsx` per route group, DB-unavailable fallback, Sentry or equivalent
- **Testing:** unit tests for the facet-query builder (the multi-spec `$elemMatch` case specifically) and `pickLocale`; Playwright for filter → URL → results and the search flow
- **Deploy:** Vercel + Atlas. Environment separation (dev/prod URIs and API keys). Automated backups on. Secrets in the platform's env store, never in the repo

---

## Environment variables

```
MONGODB_URI=
NEXT_PUBLIC_SITE_URL=
VOYAGE_API_KEY=            # Phase 3
ANTHROPIC_API_KEY=         # Phase 3
AUTH_SECRET=               # Phase 4
AUTH_URL=                  # Phase 4
```

Add `.env*.local` to `.gitignore` before the first commit that touches this file.

---

## Suggested build order within each phase

Each phase is independently reviewable. Recommended checkpoints:

1. Phase 0 → confirm scaffolding and locale routing before building UI
2. Phase 1 → review the category listing page (the most complex surface) before building the rest
3. Phase 2 → review the `Product` and `Category` schemas **before** writing the seed script; schema changes after seeding mean a migration
4. Phase 3 → review search eval results before wiring semantic search into the default search path
5. Phase 4 → review the auth implementation independently of the admin UI

The Phase 2 schema review is the one I'd most strongly recommend not skipping — with trilingual content, a schema change after data entry begins is expensive.
