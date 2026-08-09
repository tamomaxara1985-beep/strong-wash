# Admin brands — create, edit and delete

Date: 2026-08-09

## Problem

Brands exist as a model (`lib/models/brand.ts`) and reach the storefront as product
card labels, the brand filter facet and search text. They can only be created by
running `scripts/seed.ts`. There is no way for an operator to add a manufacturer,
correct a name, or retire one.

`/admin/products` and `/admin/categories` already cover their entities. Brands are
the remaining catalogue dimension with no panel.

## Scope

Full CRUD at `/admin/brands`, built the same way `/admin/categories` is: a list
page, a create page, an edit page, one shared form component, and an API pair.

Out of scope: the model's `logo` field. Nothing reads it — it is absent from the
`Brand` type, from `toBrand`, and from every storefront component. An editor for it
would write data nothing renders. It stays untouched, not exposed in the form.

Brands are flat. There is no parent, so none of the category reindexing applies.

## Data and read layer

The `Brand` model and the `Brand` type are unchanged.

**`listAdminBrands(): Promise<AdminBrandRow[]>`** in `lib/queries/admin.ts`.

```ts
type AdminBrandRow = {
  id: string;
  slug: string;
  name: string;
  description?: LocalizedString;
  order: number;
  isActive: boolean;
  productCount: number;
};
```

Reads every brand, including inactive ones — the storefront hides those, which is
exactly why the panel must show them. `productCount` comes from one
`Product.aggregate` grouping by `brand`, the same shape as the category own-count
in `listAdminCategories`. Sorted by `order`, then `name`.

**`getAdminBrand(id)`** filters that list, mirroring `getAdminCategory`.

**`getAllBrandsIncludingInactive()`** in `lib/queries/brands.ts`, `cache`-wrapped
like `getAllBrands`, with no `isActive` filter.

### Inactive brands must not blank their products

`lib/queries/products.ts` builds `brandById` from `getAllBrands()`, which is
active-only, and uses it to denormalise `brandSlug` / `brandName` onto every
product (lines 343-348 and 388-393). Today no brand is ever inactive, so the map is
always complete. The moment the panel exposes the Active toggle, hiding a brand
would leave its products listed with an empty brand name and an empty brand link —
a silent blank, not an error.

Fix: the two name-resolution sites read `getAllBrandsIncludingInactive()`.
`getAllBrands()` stays active-only and keeps feeding the filter resolution
(line 94-99) and the facet list (`readBrandFacet`).

Result: hiding a brand removes it from the filter sidebar and from facet counts,
while its products stay listed under their correct name. Hiding is a
merchandising action, not a delete.

### Product form picker

`getProductFormOptions` already reads `Brand.find({})` — all brands, active or not.
This stays as it is. Filtering it to active would break editing: a product whose
brand was hidden would find no matching `<option>`, the select would fall back to
the first brand in the list, and saving would silently reassign the product to a
different manufacturer.

Instead the option label gains a suffix for hidden brands — `Kärcher (hidden)` — so
the state is visible without the value disappearing. `getProductFormOptions`
therefore selects `name isActive` rather than `name`.

## Write layer

**`brandSchema`** in `lib/auth/schemas.ts`, beside `categorySchema`:

- `slug` — the shared `slug` validator.
- `name` — `z.string().trim().min(1).max(80)`. A plain string, **not** localized:
  manufacturer names are proper nouns and the model already stores one string for
  all three locales.
- `description` — the same optional trilingual object as `categorySchema`, each
  locale `max(2000)`.
- `order` — the same preprocessed `coerce.number().int().min(0).max(9999)`.
- `isActive` — `z.boolean().default(true)`.

**`lib/brands/write.ts`**, mirroring `lib/categories/write.ts`:

- `canDelete(brandId)` → `{ ok: true }` or `{ ok: false, products: number }`.
- `repairBrandSearchText(brandId, name)` → rewrites `searchText` for every product
  of that brand and returns the number rewritten.

### Why the rename repair exists

`Product.searchText` is a denormalised per-locale haystack built from the product
name, the **brand name**, the SKU, the short description and the specs
(`lib/products/write.ts:198`). It is written once at product save and never
recomputed. Rename a brand and every one of its products keeps advertising the old
name: the lexical search and `/api/search/suggest` match a manufacturer that no
longer exists and miss the one that does, with nothing failing loudly.

`repairBrandSearchText` loads the brand's products, rebuilds each `searchText` with
the new brand name, and bulk-writes them.

To avoid two drifting copies of the formula, `buildSearchText` in
`lib/products/write.ts` is exported, and its first parameter is narrowed from
`ProductInput` to the three fields it actually reads:

```ts
export function buildSearchText(
  input: { name: LocalizedString; sku: string; shortDescription?: LocalizedString },
  brandName: string,
  specs: ProductSpec[],
): LocalizedString
```

The existing call site passes `ProductInput`, which is structurally compatible. The
repair path passes the stored document's own fields.

A slug change needs no repair: product slugs are resolved live through
`brandById`, never stored on the product.

## API

All three handlers run `assertSameOrigin` then `requireAdmin`, and return through
`apiError` / `validationError` / `notFoundJson`, exactly as the category handlers
do.

**`POST /api/admin/brands`** — parse, pre-check the slug (`{ slug: "taken" }`),
create, return `201 { id }`. E11000 is also caught and mapped to the same error,
because the unique index is the only check that holds under concurrency.

**`PATCH /api/admin/brands/[id]`** — parse, slug clash check excluding self, save.
If the name changed, call `repairBrandSearchText` and return
`{ id, repaired: n }`; if it did not, skip the repair and return `{ id, repaired: 0 }`.

**`DELETE /api/admin/brands/[id]`** — `canDelete` first. On refusal, `409
{ error: "has_products", products: n }`. Deleting is refused rather than cascaded:
`Product.brand` is a required ref, so cascading would either delete machines or
leave documents that fail validation on their next save. Removing a filter entry
should not remove the catalogue.

## UI

**Nav** — `{ href: "/admin/brands", label: "Brands", icon: Factory }` in the `NAV`
array of `app/admin/layout.tsx`, between Products and Categories.

**`/admin/brands`** — server component rendering `listAdminBrands()` in the same
table shell as the categories list: columns Brand (link to the edit page) · Slug ·
Products · Order · State, with an `active` / `hidden` badge and a `New brand`
button matching the categories header. A footer line states that hiding a brand
removes it from the storefront filter while its machines stay listed under their
name.

**`components/admin/brand-row-actions.tsx`** — a small client component per row
with edit and delete, modelled on `product-row-actions.tsx`: `window.confirm`,
`fetch(..., { method: "DELETE" })`, `router.refresh()` on success. The 409 is
rendered as actionable text — `12 products use this brand, so they would be left
without a manufacturer. Open it and untick "Active" to hide it from the site
instead.` — with singular / plural handled as that component already does.
Delete lives on the list row, not inside the edit form, because the list is where
the decision to remove is made.

**`/admin/brands/new`** and **`/admin/brands/[id]`** — thin server pages matching
`app/admin/categories/new/page.tsx` and `[id]/page.tsx`: a back link, a heading, and
the shared form.

**`components/admin/brand-form.tsx`** — client component, one shared form for both
modes, following `category-form.tsx`: local draft state, per-field errors keyed by
the API's `{field: code}` contract, a disabled submit while pending. Fields: slug,
name (single input), description with the same ka/en/ru locale tabs, order, and an
Active checkbox. On a successful PATCH with `repaired > 0` it reports
`Saved. Reindexed N products.` before navigating.

## Testing

This repository has no test runner; `/admin/categories` shipped verified by an
API-check and browser-check pass against Atlas, and this follows the same
practice. Checks to run:

API:
1. Create a brand; it appears in `listAdminBrands` and in the product form picker.
2. Duplicate slug refused with `{ slug: "taken" }`.
3. Malformed slug refused; empty name refused; name over 80 chars refused.
4. Non-admin and cross-origin requests refused on all three handlers.
5. Rename a brand with products → `repaired` equals its product count, and
   `/api/search/suggest` finds the new name and no longer matches the old one.
6. Rename with no name change → `repaired: 0` and no product writes.
7. Slug change → products still resolve `brandSlug`, no repair reported.
8. Delete a brand with products → 409 naming the count; the brand still exists.
9. Delete a brand with no products → 200, gone from the list.
10. Deactivate a brand → absent from `/api/products` facets and from the filter
    sidebar, while its products stay listed with their brand name intact.

Browser:
11. The list shows inactive brands with a `hidden` badge and correct counts.
12. Create, edit and delete round-trip from the UI with `router.refresh()`
    reflecting each.
13. The delete refusal message renders on the row, singular and plural.
14. A hidden brand appears in the product form select as `(hidden)` and editing an
    unrelated field on one of its products does not change its brand.
15. The storefront brand filter no longer lists the hidden brand.
