# Admin Brand CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the admin panel a `/admin/brands` section that can create, edit and delete manufacturer brands, without leaving the storefront's denormalised brand data stale.

**Architecture:** Mirrors the existing `/admin/categories` section — a server-rendered list page, `new` and `[id]` pages sharing one client form, and a two-file API (`route.ts` for POST, `[id]/route.ts` for PATCH/DELETE). Two pieces of denormalised data need care: every product stores its brand name inside `searchText`, so a rename triggers a repair pass; and product cards resolve `brandName` from an active-only brand list, so the new Active toggle would blank them unless name resolution reads every brand.

**Tech Stack:** Next.js 16 (App Router, `RouteContext`/`PageProps` typed route helpers), React 19, Mongoose 9, Zod, Tailwind v4, shadcn-style UI primitives in `components/ui`, `tsx` for scripts.

**Spec:** `docs/superpowers/specs/2026-08-09-admin-brands-crud-design.md`

## Global Constraints

- **Read the Next.js docs first.** `AGENTS.md` requires it: this Next version has breaking changes versus training data. Relevant guides live in `node_modules/next/dist/docs/`. Route handler context is typed `RouteContext<"/api/admin/brands/[id]">`, page props are `PageProps<"/admin/brands/[id]">`, and both `params` are Promises that must be awaited — copy the shapes from `app/api/admin/categories/[id]/route.ts` and `app/admin/categories/[id]/page.tsx` rather than writing them from memory.
- **The admin tree is unlocalised, English-only.** `proxy.ts` excludes `/admin` from the next-intl middleware. No `next-intl` imports in any admin page or component; UI copy is plain English strings.
- **Every admin API handler runs `assertSameOrigin(request)` then `requireAdmin()`, in that order, before anything else** — both from `@/lib/auth/guard`.
- **Error shapes come from `@/lib/api`:** `validationError({field: code})` for 422, `notFoundJson("brand")` for 404, `apiError(error)` in every catch. Never return a raw Mongo error.
- **Brand names are not localized.** `Brand.name` is a single `String` (`lib/models/brand.ts:9`) — manufacturer names are proper nouns in ka/en/ru. `description` *is* localized.
- **`Product.brand` is a required ref** (`lib/models/product.ts:36`). Nothing in this plan may orphan it.
- **The model's `logo` field stays untouched** — not in the schema, not in the form, not rendered. Nothing reads it today.
- **No test runner exists in this repo.** Verification is `npx tsc --noEmit`, `npm run lint`, a DB-level script added in Task 1, and a browser pass in Task 8. Do not add jest/vitest.
- **Commit after every task.** Conventional Commits, English, no caveman phrasing in commit messages.
- **`.env.local` must hold a working `MONGODB_URI`** for the verification script and dev server. `scripts/seed.ts` shows how scripts load it.

---

## File Structure

**Create:**
- `lib/brands/write.ts` — delete guard and the `searchText` repair. Mirrors `lib/categories/write.ts`.
- `app/api/admin/brands/route.ts` — POST.
- `app/api/admin/brands/[id]/route.ts` — PATCH, DELETE.
- `app/admin/brands/page.tsx` — list.
- `app/admin/brands/new/page.tsx` — create.
- `app/admin/brands/[id]/page.tsx` — edit.
- `components/admin/brand-form.tsx` — shared create/edit form.
- `components/admin/brand-row-actions.tsx` — per-row edit link + delete button.
- `scripts/verify-brands.ts` — DB-level checks for the write layer.

**Modify:**
- `lib/queries/brands.ts` — add `getAllBrandsIncludingInactive`.
- `lib/queries/products.ts:343` and `:388` — resolve brand names from the unfiltered list.
- `lib/queries/admin.ts` — add `AdminBrandRow`, `listAdminBrands`, `getAdminBrand`; widen `ProductFormOptions.brands` with `isActive`.
- `lib/auth/schemas.ts` — add `brandSchema`.
- `lib/products/write.ts` — export `buildSearchText`, narrow its first parameter.
- `components/admin/product-form.tsx:438-441` — label hidden brands in the select.
- `app/admin/layout.tsx:23-30` — nav entry.
- `package.json` — `verify:brands` script.

---

### Task 1: Read layer — admin rows, unfiltered name resolution, verification harness

**Files:**
- Modify: `lib/queries/brands.ts`
- Modify: `lib/queries/products.ts:343`, `lib/queries/products.ts:388`
- Modify: `lib/queries/admin.ts` (add after the `AdminCategoryRow` block, around line 257)
- Create: `scripts/verify-brands.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `getAllBrandsIncludingInactive(): Promise<Brand[]>` from `lib/queries/brands.ts`
  - `type AdminBrandRow = { id: string; slug: string; name: string; description?: LocalizedString; order: number; isActive: boolean; productCount: number }` from `lib/queries/admin.ts`
  - `listAdminBrands(): Promise<AdminBrandRow[]>`, `getAdminBrand(id: string): Promise<AdminBrandRow | null>` from `lib/queries/admin.ts`
  - `npm run verify:brands` — a script later tasks extend.

- [ ] **Step 1: Add the unfiltered brand read**

In `lib/queries/brands.ts`, below `getAllBrands`:

```ts
/**
 * Every brand, hidden ones included.
 *
 * Name resolution must not depend on `isActive`: a product whose brand is hidden
 * is still listed, and reading it from the active-only list would render a blank
 * manufacturer instead of an inactive one. Filters and facets keep using
 * `getAllBrands` — hiding a brand should remove it as a *choice*, not as a label.
 */
export const getAllBrandsIncludingInactive = cache(async (): Promise<Brand[]> => {
  await connectToDatabase();
  const docs = await BrandModel.find({}).sort({ order: 1 }).lean();
  return docs.map(toBrand);
});
```

- [ ] **Step 2: Use it for name resolution in the product queries**

In `lib/queries/products.ts`, extend the import on line 18:

```ts
import { getAllBrands, getAllBrandsIncludingInactive } from "./brands";
```

Inside `listProducts` (around line 280) the function already holds `const brands = await getAllBrands();` and uses it for both filtering and the `brandById` map. Add a second read next to it and point the map at it:

```ts
  const brands = await getAllBrands();
  // Filters and facets use the active list above; labels use every brand, so a
  // hidden manufacturer still prints its name on the cards that reference it.
  const allBrands = await getAllBrandsIncludingInactive();
```

then change the map on line 343 from `brands` to `allBrands`:

```ts
  const brandById = new Map(allBrands.map((b) => [b.id, b]));
```

Leave `buildFilters(query, brands)` and `readBrandFacet(merged.brands ?? [], brands)` reading the **active** list — that is deliberate.

In `denormalise` (line 387-395) swap the single read:

```ts
async function denormalise(rows: unknown[]): Promise<Product[]> {
  const brands = await getAllBrandsIncludingInactive();
  const brandById = new Map(brands.map((b) => [b.id, b]));
```

- [ ] **Step 3: Add the admin row type and query**

In `lib/queries/admin.ts`, after `getAdminCategory` (line 257):

```ts
export type AdminBrandRow = {
  id: string;
  slug: string;
  name: string;
  description?: LocalizedString;
  order: number;
  isActive: boolean;
  /** Products assigned to this brand, active or not — the delete guard's number. */
  productCount: number;
};

/**
 * Every brand with its product count.
 *
 * Includes inactive brands: the storefront hides them, which is exactly why the
 * panel has to show them.
 */
export async function listAdminBrands(): Promise<AdminBrandRow[]> {
  await connectToDatabase();

  const [docs, counts] = await Promise.all([
    Brand.find({}).sort({ order: 1 }).lean(),
    Product.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $group: { _id: "$brand", n: { $sum: 1 } } },
    ]),
  ]);

  const byBrand = new Map(counts.map((row) => [String(row._id), row.n]));

  return docs
    .map((doc) => {
      const id = String(doc._id);
      return {
        id,
        slug: doc.slug,
        name: doc.name,
        description: doc.description?.ka
          ? {
              ka: doc.description.ka,
              en: doc.description.en ?? undefined,
              ru: doc.description.ru ?? undefined,
            }
          : undefined,
        order: doc.order ?? 0,
        isActive: doc.isActive ?? true,
        productCount: byBrand.get(id) ?? 0,
      };
    })
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export async function getAdminBrand(id: string): Promise<AdminBrandRow | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  const all = await listAdminBrands();
  return all.find((row) => row.id === id) ?? null;
}
```

`Types`, `Brand`, `Product`, `connectToDatabase` and `LocalizedString` are already imported at the top of the file — do not add duplicate imports.

- [ ] **Step 4: Write the verification script**

Create `scripts/verify-brands.ts`. It talks to the database directly, so it checks the query and write layers without a running server. Later tasks add cases to it.

```ts
/**
 * DB-level checks for the brand admin feature.
 *
 * Run with `npm run verify:brands`. Every fixture it creates is prefixed
 * `zzz-verify-` and removed in the `finally` block, including when an assertion
 * throws — so a failed run does not leave rows behind. It writes to whatever
 * MONGODB_URI points at, exactly like the seed script.
 */
import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";

import { Brand } from "../lib/models/brand";
import { Product } from "../lib/models/product";

// Reuses Next's own loader, so the script reads the same .env.local the app does —
// same pattern as scripts/seed.ts. Safe below the imports: nothing read at import
// time touches the environment; `connectToDatabase` reads it when called.
loadEnvConfig(process.cwd());

const PREFIX = "zzz-verify-";
let passed = 0;

function check(label: string, condition: boolean) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  passed += 1;
  console.log(`  ok  ${label}`);
}

async function cleanup() {
  await Product.deleteMany({ sku: { $regex: `^${PREFIX}` } });
  await Brand.deleteMany({ slug: { $regex: `^${PREFIX}` } });
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);

  try {
    await cleanup();

    const brand = await Brand.create({
      slug: `${PREFIX}alpha`,
      name: "Verify Alpha",
      order: 900,
      isActive: true,
    });
    check("a brand can be created", Boolean(brand._id));

    const { listAdminBrands, getAdminBrand } = await import("../lib/queries/admin");
    const rows = await listAdminBrands();
    const row = rows.find((r) => r.slug === `${PREFIX}alpha`);
    check("listAdminBrands returns the new brand", Boolean(row));
    check("its product count starts at 0", row?.productCount === 0);
    check("getAdminBrand finds it by id", (await getAdminBrand(String(brand._id)))?.slug === `${PREFIX}alpha`);

    await Brand.updateOne({ _id: brand._id }, { $set: { isActive: false } });
    const hidden = (await listAdminBrands()).find((r) => r.slug === `${PREFIX}alpha`);
    check("listAdminBrands still lists it once hidden", Boolean(hidden));
    check("and reports it as inactive", hidden?.isActive === false);
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

- [ ] **Step 5: Register the script**

In `package.json`, add to `"scripts"` after `"seed"`:

```json
    "verify:brands": "tsx scripts/verify-brands.ts",
```

- [ ] **Step 6: Run it and confirm it passes**

Run: `npm run verify:brands`
Expected: six `ok` lines, then `6 checks passed`. If it reports `MONGODB_URI is not set`, fill in `.env.local` before continuing — every later task depends on this script.

- [ ] **Step 7: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. A `Property 'getAllBrandsIncludingInactive' does not exist` error means Step 1 was skipped.

- [ ] **Step 8: Commit**

```bash
git add lib/queries/brands.ts lib/queries/products.ts lib/queries/admin.ts scripts/verify-brands.ts package.json
git commit -m "feat: read brands for the admin panel, and keep hidden ones named

listAdminBrands returns every brand with its product count, inactive included —
the panel has to show what the storefront hides.

Product cards resolved brandName from getAllBrands(), which is active-only. That
was harmless while nothing could deactivate a brand; the admin toggle is about to
make it visible as a blank manufacturer on a listed product. Name resolution now
reads every brand, while filters and facets stay active-only, so hiding a brand
removes it as a filter choice rather than as a label."
```

---

### Task 2: Product form shows hidden brands as hidden

**Files:**
- Modify: `lib/queries/admin.ts:399-404` and `:416`
- Modify: `components/admin/product-form.tsx:438-441`

**Interfaces:**
- Consumes: nothing from Task 1 at the type level.
- Produces: `ProductFormOptions.brands` widened to `{ id: string; name: string; isActive: boolean }[]`.

Why this task exists: `getProductFormOptions` already reads `Brand.find({})` — all brands. Filtering it to active would look tidy and would be a bug: a product whose brand was hidden would find no matching `<option>`, the select would fall back to the first brand, and saving any unrelated field would silently move the machine to a different manufacturer.

- [ ] **Step 1: Widen the options type**

In `lib/queries/admin.ts`, line 400:

```ts
export type ProductFormOptions = {
  /**
   * Every brand, hidden ones included. Filtering to active would leave a product
   * on a hidden brand with no matching option, and the select would silently
   * reassign it on the next save.
   */
  brands: { id: string; name: string; isActive: boolean }[];
```

- [ ] **Step 2: Select the field and map it**

Line 416, add `isActive` to the projection:

```ts
    Brand.find({}).sort({ order: 1 }).select("name isActive").lean(),
```

Line 436, carry it through:

```ts
    brands: brands.map((b) => ({ id: String(b._id), name: b.name, isActive: b.isActive ?? true })),
```

- [ ] **Step 3: Label hidden brands in the select**

In `components/admin/product-form.tsx`, replace the option body at lines 438-441:

```tsx
            {options.brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.isActive ? brand.name : `${brand.name} (hidden)`}
              </option>
            ))}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/queries/admin.ts components/admin/product-form.tsx
git commit -m "feat: mark hidden brands in the product form picker

The picker deliberately keeps listing inactive brands. Dropping them would leave a
product on a hidden brand with no matching option, so the select would fall back to
the first entry and the next save would silently reassign the machine. Labelling
them '(hidden)' shows the state without removing the value."
```

---

### Task 3: Validation schema and write layer

**Files:**
- Modify: `lib/auth/schemas.ts` (after `categorySchema`, line 158)
- Modify: `lib/products/write.ts:96-118`
- Create: `lib/brands/write.ts`
- Modify: `scripts/verify-brands.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1-2.
- Produces:
  - `brandSchema` from `lib/auth/schemas.ts` — parsed shape `{ slug: string; name: string; description?: {ka?: string; en?: string; ru?: string}; order: number; isActive: boolean }`
  - `buildSearchText(input: { name: LocalizedString; sku: string; shortDescription?: LocalizedString }, brandName: string, specs: ProductSpec[]): LocalizedString` — now exported from `lib/products/write.ts`
  - `canDelete(id: Types.ObjectId): Promise<{ ok: true } | { ok: false; products: number }>` from `lib/brands/write.ts`
  - `repairBrandSearchText(id: Types.ObjectId, brandName: string): Promise<number>` from `lib/brands/write.ts`

- [ ] **Step 1: Add `brandSchema`**

In `lib/auth/schemas.ts`, after the closing `});` of `categorySchema` (line 158):

```ts
/**
 * `name` is a plain string, not `localizedRequired`: manufacturer names are proper
 * nouns and the model stores one string for all three locales.
 */
export const brandSchema = z.object({
  slug,
  name: z.string().trim().min(1, "required").max(80),
  description: z
    .object({
      ka: z.string().trim().max(2000).optional().or(z.literal("")),
      en: z.string().trim().max(2000).optional().or(z.literal("")),
      ru: z.string().trim().max(2000).optional().or(z.literal("")),
    })
    .optional(),
  order: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? 0 : value),
    z.coerce.number().int().min(0).max(9999),
  ),
  isActive: z.boolean().default(true),
});
```

- [ ] **Step 2: Export `buildSearchText` with a narrowed parameter**

In `lib/products/write.ts`, change the declaration at line 96-100 from a private function taking `ProductInput` to an exported one taking only the fields it reads. The body is unchanged.

```ts
/**
 * Denormalised haystack for the substring search, per locale.
 *
 * Exported because the brand write path rebuilds it too: `brandName` is baked in
 * here, so renaming a brand leaves every one of its products advertising the old
 * manufacturer. The parameter is narrowed to the three fields actually read so a
 * stored document can be passed as readily as a `ProductInput`.
 */
export function buildSearchText(
  input: { name: LocalizedString; sku: string; shortDescription?: LocalizedString },
  brandName: string,
  specs: ProductSpec[],
): LocalizedString {
```

The existing call site (line 198, `buildSearchText(input, brand.name, specs)`) still compiles: `ProductInput` is structurally assignable to the narrowed type.

- [ ] **Step 3: Write the brand write layer**

Create `lib/brands/write.ts`:

```ts
import { Types } from "mongoose";

import { Product } from "../models/product";
import { buildSearchText } from "../products/write";
import type { LocalizedString, ProductSpec } from "../types";

/**
 * The write side of a brand: the two operations that reach past the brand
 * document itself.
 */

export type DeleteBlock = { ok: true } | { ok: false; products: number };

/**
 * Deletion is refused while any product references the brand.
 *
 * `Product.brand` is required, so there is no orphan state to fall back to:
 * cascading would delete machines, and unsetting would leave documents that fail
 * validation on their next save. The brand can be deactivated instead, which
 * takes it out of the storefront filter and leaves everything intact.
 */
export async function canDelete(id: Types.ObjectId): Promise<DeleteBlock> {
  const products = await Product.countDocuments({ brand: id });
  return products > 0 ? { ok: false, products } : { ok: true };
}

const localized = (value: { ka?: string | null; en?: string | null; ru?: string | null } | null | undefined): LocalizedString => ({
  ka: value?.ka ?? "",
  en: value?.en ?? undefined,
  ru: value?.ru ?? undefined,
});

/**
 * Rewrites `searchText` for every product of a brand and returns how many changed.
 *
 * `searchText` is a denormalised per-locale haystack containing the brand name
 * (`lib/products/write.ts`), written once at product save and never recomputed.
 * Without this pass a rename leaves the lexical search and `/api/search/suggest`
 * matching a manufacturer that no longer exists and missing the one that does,
 * with nothing failing loudly.
 */
export async function repairBrandSearchText(
  id: Types.ObjectId,
  brandName: string,
): Promise<number> {
  const products = await Product.find({ brand: id })
    .select("name sku shortDescription specs")
    .lean();
  if (!products.length) return 0;

  const operations = products.map((product) => ({
    updateOne: {
      filter: { _id: product._id },
      update: {
        $set: {
          searchText: buildSearchText(
            {
              name: localized(product.name),
              sku: product.sku,
              shortDescription: localized(product.shortDescription),
            },
            brandName,
            (product.specs ?? []) as ProductSpec[],
          ),
        },
      },
    },
  }));

  const result = await Product.bulkWrite(operations);
  return result.modifiedCount ?? 0;
}
```

- [ ] **Step 4: Add write-layer checks to the verification script**

In `scripts/verify-brands.ts`, inside the `try` block after the existing checks and before the closing brace, append:

```ts
    await Brand.updateOne({ _id: brand._id }, { $set: { isActive: true } });

    const { canDelete, repairBrandSearchText } = await import("../lib/brands/write");
    check("an unused brand can be deleted", (await canDelete(brand._id)).ok === true);

    // A product needs a category ref; any existing one will do, since nothing here
    // reads it back.
    const { Category } = await import("../lib/models/category");
    const category = await Category.findOne({}).select("_id").lean();
    if (!category) throw new Error("no categories in the database — run `npm run seed` first");

    await Product.create({
      sku: `${PREFIX}sku-1`,
      slug: `${PREFIX}product-1`,
      name: { ka: "სატესტო", en: "Verify Machine", ru: "Тест" },
      shortDescription: { ka: "ა", en: "b", ru: "в" },
      description: { ka: "ა", en: "b", ru: "в" },
      brand: brand._id,
      category: category._id,
      categoryAncestors: [category._id],
      price: 100,
      effectivePrice: 100,
      searchText: { ka: "Verify Alpha", en: "Verify Alpha", ru: "Verify Alpha" },
      specs: [],
    });

    const blocked = await canDelete(brand._id);
    check("a brand with products cannot be deleted", blocked.ok === false);
    check("and the refusal names the count", blocked.ok === false && blocked.products === 1);

    const repaired = await repairBrandSearchText(brand._id, "Verify Beta");
    check("renaming repairs its products", repaired === 1);

    const after = await Product.findOne({ sku: `${PREFIX}sku-1` }).select("searchText").lean();
    check("the new name is in searchText", after?.searchText?.en?.includes("Verify Beta") === true);
    check("the old name is gone", after?.searchText?.en?.includes("Verify Alpha") === false);
    check("the product's own name survived", after?.searchText?.en?.includes("Verify Machine") === true);
```

- [ ] **Step 5: Run the verification script**

Run: `npm run verify:brands`
Expected: `13 checks passed`. A failure on "the old name is gone" means `buildSearchText` was called with the stale brand name; a failure on "the product's own name survived" means the narrowed parameter dropped a field.

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/auth/schemas.ts lib/products/write.ts lib/brands/write.ts scripts/verify-brands.ts
git commit -m "feat: brand validation and the rename repair

Product.searchText bakes in the brand name, so a rename would leave every one of
that brand's products advertising a manufacturer that no longer exists — the
lexical search would match the old name and miss the new one, silently.
repairBrandSearchText rebuilds them through the same buildSearchText the product
write path uses, now exported and narrowed to the fields it reads so the two
cannot drift.

Deleting is refused while any product references the brand: Product.brand is
required, so there is no orphan state to fall back to."
```

---

### Task 4: API routes

**Files:**
- Create: `app/api/admin/brands/route.ts`
- Create: `app/api/admin/brands/[id]/route.ts`

**Interfaces:**
- Consumes: `brandSchema`, `fieldErrors` from `@/lib/auth/schemas`; `canDelete`, `repairBrandSearchText` from `@/lib/brands/write`.
- Produces: the HTTP contract the form in Task 6 codes against —
  - `POST /api/admin/brands` → `201 { id: string }`
  - `PATCH /api/admin/brands/[id]` → `200 { id: string; repaired: number }`
  - `DELETE /api/admin/brands/[id]` → `200 { deleted: string }` or `409 { error: "has_products", products: number }`
  - validation failures → `422 { error: "validation_failed", fields: { slug?: "taken" | "slug_format"; name?: "required" } }`

- [ ] **Step 1: Write the create handler**

Create `app/api/admin/brands/route.ts`:

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, validationError } from "@/lib/api";
import { assertSameOrigin, requireAdmin } from "@/lib/auth/guard";
import { brandSchema, fieldErrors } from "@/lib/auth/schemas";
import { connectToDatabase } from "@/lib/db";
import { Brand } from "@/lib/models/brand";

/** Creates a manufacturer brand. */
export async function POST(request: NextRequest) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const parsed = brandSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(fieldErrors(parsed.error));

    await connectToDatabase();

    const clash = await Brand.findOne({ slug: parsed.data.slug }).select("_id").lean();
    if (clash) return validationError({ slug: "taken" });

    const doc = new Brand({
      slug: parsed.data.slug,
      name: parsed.data.name,
      description: normaliseDescription(parsed.data.description),
      order: parsed.data.order,
      isActive: parsed.data.isActive,
    });
    await doc.save();

    return NextResponse.json({ id: String(doc._id) }, { status: 201 });
  } catch (error) {
    // The pre-check above loses to a concurrent insert; the unique index does not.
    if (error instanceof Error && "code" in error && (error as { code?: number }).code === 11000) {
      return validationError({ slug: "taken" });
    }
    return apiError(error);
  }
}
```

- [ ] **Step 2: Add the description normaliser**

`lib/categories/description.ts` exports `normaliseDescription` for the category shape. Check it first:

Run: `cat lib/categories/description.ts`

If its signature accepts `{ka?: string; en?: string; ru?: string} | undefined` and returns the localized subdocument or `undefined`, import it in both new route files:

```ts
import { normaliseDescription } from "@/lib/categories/description";
```

If it is bound to categories in a way that does not fit (for example it requires `ka`), define this local helper at the top of `app/api/admin/brands/route.ts` instead and export it for the `[id]` route to import:

```ts
/** An all-empty description is stored as absent, so nothing renders an empty block. */
export function normaliseBrandDescription(
  value: { ka?: string; en?: string; ru?: string } | undefined,
) {
  const ka = value?.ka?.trim();
  const en = value?.en?.trim();
  const ru = value?.ru?.trim();
  if (!ka && !en && !ru) return undefined;
  return { ka: ka ?? "", en: en || undefined, ru: ru || undefined };
}
```

Use whichever one you chose consistently across both route files.

- [ ] **Step 3: Write the update and delete handlers**

Create `app/api/admin/brands/[id]/route.ts`:

```ts
import { Types } from "mongoose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, notFoundJson, validationError } from "@/lib/api";
import { assertSameOrigin, requireAdmin } from "@/lib/auth/guard";
import { brandSchema, fieldErrors } from "@/lib/auth/schemas";
import { canDelete, repairBrandSearchText } from "@/lib/brands/write";
import { connectToDatabase } from "@/lib/db";
import { Brand } from "@/lib/models/brand";

/**
 * Updates a brand, repairing its products when the name changes.
 *
 * The repair is the reason this is not a plain `$set`: every product stores the
 * brand name inside `searchText`, so a rename without it leaves the search
 * matching a manufacturer that no longer exists. A slug change needs nothing —
 * product slugs are resolved live, never stored on the product.
 */
export async function PATCH(request: NextRequest, context: RouteContext<"/api/admin/brands/[id]">) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) return notFoundJson("brand");

    const parsed = brandSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(fieldErrors(parsed.error));

    await connectToDatabase();
    const brand = await Brand.findById(id);
    if (!brand) return notFoundJson("brand");

    const clash = await Brand.findOne({ _id: { $ne: brand._id }, slug: parsed.data.slug })
      .select("_id")
      .lean();
    if (clash) return validationError({ slug: "taken" });

    const renamed = brand.name !== parsed.data.name;

    brand.slug = parsed.data.slug;
    brand.name = parsed.data.name;
    brand.description = normaliseDescription(parsed.data.description);
    brand.order = parsed.data.order;
    brand.isActive = parsed.data.isActive;
    await brand.save();

    const repaired = renamed ? await repairBrandSearchText(brand._id, brand.name) : 0;

    return NextResponse.json({ id: String(brand._id), repaired });
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: number }).code === 11000) {
      return validationError({ slug: "taken" });
    }
    return apiError(error);
  }
}

/** Deletes a brand, provided no product references it. */
export async function DELETE(request: NextRequest, context: RouteContext<"/api/admin/brands/[id]">) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) return notFoundJson("brand");

    await connectToDatabase();
    const brand = await Brand.findById(id).select("_id");
    if (!brand) return notFoundJson("brand");

    const verdict = await canDelete(brand._id);
    if (!verdict.ok) {
      // Product.brand is required, so there is no orphan state: the products would
      // either have to go too, or be left invalid. Hiding the brand is the answer.
      return NextResponse.json(
        { error: "has_products", products: verdict.products },
        { status: 409 },
      );
    }

    await brand.deleteOne();
    return NextResponse.json({ deleted: id });
  } catch (error) {
    return apiError(error);
  }
}
```

Use the same `normaliseDescription` / `normaliseBrandDescription` import chosen in Step 2.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. If `RouteContext<"/api/admin/brands/[id]">` is reported as unknown, the route files are not yet picked up by the generated types — run `npm run dev` once to regenerate, then re-run.

- [ ] **Step 5: Smoke-test the guards**

Run: `npm run dev` in one terminal, then in another:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/admin/brands \
  -H "Content-Type: application/json" -d '{"slug":"x","name":"X"}'
```

Expected: `403` (no `Origin`/session — `assertSameOrigin` or `requireAdmin` rejects). Anything in the 2xx range means a guard is missing.

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/brands
git commit -m "feat: brand create, update and delete endpoints

PATCH reports how many products it repaired, so a slow save is legible rather than
mysterious. DELETE refuses with the product count instead of cascading — removing a
filter entry should not remove the catalogue."
```

---

### Task 5: List page, nav entry and row delete

**Files:**
- Modify: `app/admin/layout.tsx:1` and `:23-30`
- Create: `app/admin/brands/page.tsx`
- Create: `components/admin/brand-row-actions.tsx`

**Interfaces:**
- Consumes: `listAdminBrands`, `AdminBrandRow` from Task 1; the `DELETE` contract from Task 4.
- Produces: `<BrandRowActions id={string} name={string} />`.

- [ ] **Step 1: Add the nav entry**

In `app/admin/layout.tsx`, extend the icon import on line 1 with `Factory` (keep the list alphabetical):

```ts
import { Factory, FileImage, FolderTree, LayoutDashboard, Package, Paperclip, Users } from "lucide-react";
```

and add to `NAV` between Products and Categories:

```ts
  { href: "/admin/brands", label: "Brands", icon: Factory },
```

- [ ] **Step 2: Write the row actions component**

Create `components/admin/brand-row-actions.tsx`:

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
 * Delete lives on the list rather than inside the edit form: the list is where the
 * decision to remove a brand is made. The server enforces the product guard; this
 * only surfaces the action and renders the refusal.
 */
export function BrandRowActions({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(`Delete "${name}"?\n\nThis cannot be undone.`)) return;

    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/brands/${id}`, { method: "DELETE" });
      if (response.ok) {
        router.refresh();
        return;
      }

      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        products?: number;
      };
      if (body.error === "has_products") {
        // Actionable rather than just refused: the alternative is one click away.
        const count = body.products ?? 0;
        setError(
          `${count} product${count === 1 ? "" : "s"} use${count === 1 ? "s" : ""} this brand, so ${
            count === 1 ? "it" : "they"
          } would be left without a manufacturer. Open it and untick "Active" to take it off the site instead.`,
        );
      } else if (body.error === "forbidden" || body.error === "unauthenticated") {
        setError("Your session no longer has admin access. Sign in again.");
      } else {
        setError("Could not delete that brand.");
      }
    } catch {
      setError("Could not delete that brand.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex justify-end gap-1.5">
        <Link
          href={`/admin/brands/${id}`}
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

- [ ] **Step 3: Write the list page**

Create `app/admin/brands/page.tsx`:

```tsx
import { Plus } from "lucide-react";
import Link from "next/link";

import { BrandRowActions } from "@/components/admin/brand-row-actions";
import { Badge } from "@/components/ui/badge";
import { listAdminBrands } from "@/lib/queries/admin";

export default async function AdminBrandsPage() {
  const brands = await listAdminBrands();

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display text-2xl">Brands</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {brands.length} manufacturer{brands.length === 1 ? "" : "s"}, including ones hidden from
            the site.
          </p>
        </div>
        <Link
          href="/admin/brands/new"
          className="bg-brand-yellow text-brand-black hover:bg-brand-yellow-dark inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-bold transition-colors"
        >
          <Plus aria-hidden className="size-4" />
          New brand
        </Link>
      </header>

      <div className="bg-card overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-semibold">Brand</th>
              <th scope="col" className="px-3 py-2 text-left font-semibold">Slug</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Products</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Order</th>
              <th scope="col" className="px-3 py-2 text-left font-semibold">State</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {brands.map((brand) => (
              <tr key={brand.id} className="border-t">
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/brands/${brand.id}`}
                    className="font-medium hover:underline"
                  >
                    {brand.name}
                  </Link>
                </td>
                <td className="text-data text-muted-foreground px-3 py-2 text-xs">{brand.slug}</td>
                <td className="text-data px-3 py-2 text-right">{brand.productCount}</td>
                <td className="text-data px-3 py-2 text-right">{brand.order}</td>
                <td className="px-3 py-2">
                  {brand.isActive ? (
                    <Badge variant="secondary">active</Badge>
                  ) : (
                    <Badge variant="outline">hidden</Badge>
                  )}
                </td>
                <td className="px-3 py-2">
                  <BrandRowActions id={brand.id} name={brand.name} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-muted-foreground text-xs">
        A brand can only be deleted once no product uses it. Hiding one instead takes it out of the
        storefront filter while its machines stay listed under their manufacturer&rsquo;s name.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Look at it**

Run `npm run dev`, sign in as an admin, open `http://localhost:3000/admin/brands`.
Expected: Brands in the left nav; the seeded 15 brands listed with product counts; Edit links pointing at `/admin/brands/<id>` (404 until Task 6); Delete on a brand that has products showing the refusal text inline.

- [ ] **Step 6: Commit**

```bash
git add app/admin/layout.tsx app/admin/brands/page.tsx components/admin/brand-row-actions.tsx
git commit -m "feat: list brands in the admin panel and delete from the row

Delete sits on the list row rather than inside the edit form, since the list is
where the decision to remove one is made. A refusal names the product count and
points at the Active toggle, which is the actual answer for a brand still in use."
```

---

### Task 6: Create and edit pages with the shared form

**Files:**
- Create: `components/admin/brand-form.tsx`
- Create: `app/admin/brands/new/page.tsx`
- Create: `app/admin/brands/[id]/page.tsx`

**Interfaces:**
- Consumes: `AdminBrandRow`, `getAdminBrand` from Task 1; the `POST` and `PATCH` contracts from Task 4.
- Produces: `<BrandForm brand={AdminBrandRow | undefined} />`.

- [ ] **Step 1: Write the form**

Create `components/admin/brand-form.tsx`:

```tsx
"use client";

import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminBrandRow } from "@/lib/queries/admin";
import { cn } from "@/lib/utils";

const LOCALES = ["ka", "en", "ru"] as const;
type Locale = (typeof LOCALES)[number];

function messageFor(code: string): string {
  switch (code) {
    case "taken":
      return "Another brand already uses this slug.";
    case "required":
      return "Required.";
    case "slug_format":
      return "Lowercase letters, numbers and single hyphens only.";
    default:
      return "Invalid.";
  }
}

/**
 * One form for both create and edit.
 *
 * The name is a single field, not a per-locale one: manufacturer names are proper
 * nouns and the model stores one string for all three locales. Only the optional
 * description is translated.
 */
export function BrandForm({ brand }: { brand?: AdminBrandRow }) {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("ka");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const [draft, setDraft] = useState({
    slug: brand?.slug ?? "",
    name: brand?.name ?? "",
    description: {
      ka: brand?.description?.ka ?? "",
      en: brand?.description?.en ?? "",
      ru: brand?.description?.ru ?? "",
    } as Record<Locale, string>,
    order: String(brand?.order ?? 0),
    isActive: brand?.isActive ?? true,
  });

  const fieldError = (key: string) => (fields[key] ? messageFor(fields[key]) : null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});

    const payload = {
      slug: draft.slug,
      name: draft.name,
      description: {
        ka: draft.description.ka || undefined,
        en: draft.description.en || undefined,
        ru: draft.description.ru || undefined,
      },
      order: Number(draft.order || 0),
      isActive: draft.isActive,
    };

    try {
      const response = await fetch(brand ? `/api/admin/brands/${brand.id}` : "/api/admin/brands", {
        method: brand ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const body = (await response.json()) as { repaired?: number };
        // A rename rewrites the search text of every product on the brand; saying
        // so makes a slow save legible rather than mysterious.
        if (body.repaired) {
          window.alert(
            `Saved. ${body.repaired} product${body.repaired === 1 ? "" : "s"} reindexed for the new name.`,
          );
        }
        router.push("/admin/brands");
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
      } else {
        setError("That did not save. Please try again.");
      }
    } catch {
      setError("That did not save. Please try again.");
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
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            aria-invalid={Boolean(fieldError("name"))}
            className="h-10"
            required
          />
          {fieldError("name") ? (
            <p className="text-destructive text-xs">{fieldError("name")}</p>
          ) : (
            <p className="text-muted-foreground text-xs">
              The same in all three languages — Kärcher, WashTec, Istobal.
            </p>
          )}
        </div>

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
              Used in filter links: ?brand={draft.slug || "…"}
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
            </button>
          ))}
          <span className="text-muted-foreground ml-auto text-xs">
            Description is optional in every language.
          </span>
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
          Active — offered as a filter on the site
        </label>
        {brand && brand.productCount > 0 ? (
          <span className="text-muted-foreground text-xs">
            {brand.productCount} product{brand.productCount === 1 ? "" : "s"} use this brand. Hiding
            it removes the filter; they stay listed under this name.
          </span>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} className="h-11 font-bold">
          <Save aria-hidden className="size-4" />
          {pending ? "Saving…" : brand ? "Save changes" : "Create brand"}
        </Button>
      </div>
    </form>
  );
}
```

There is no delete button here — it lives on the list row, added in Task 5.

- [ ] **Step 2: Write the create page**

Create `app/admin/brands/new/page.tsx`:

```tsx
import Link from "next/link";

import { BrandForm } from "@/components/admin/brand-form";

export default function NewBrandPage() {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <Link href="/admin/brands" className="text-muted-foreground text-sm hover:underline">
          ← Brands
        </Link>
        <h1 className="text-display mt-1 text-2xl">New brand</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Manufacturer names stay untranslated; only the description is per-language.
        </p>
      </header>

      <BrandForm />
    </div>
  );
}
```

- [ ] **Step 3: Write the edit page**

Create `app/admin/brands/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";

import { BrandForm } from "@/components/admin/brand-form";
import { getAdminBrand } from "@/lib/queries/admin";

export default async function EditBrandPage({ params }: PageProps<"/admin/brands/[id]">) {
  const { id } = await params;
  const brand = await getAdminBrand(id);
  if (!brand) notFound();

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin/brands" className="text-muted-foreground text-sm hover:underline">
            ← Brands
          </Link>
          <h1 className="text-display mt-1 text-2xl">{brand.name}</h1>
          <p className="text-data text-muted-foreground mt-1 text-sm">
            {brand.slug} · {brand.productCount} product{brand.productCount === 1 ? "" : "s"}
          </p>
        </div>
        <a
          href={`/en/search?brand=${brand.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:bg-secondary inline-flex h-9 items-center rounded-md border px-3 text-sm font-semibold"
        >
          View on site ↗
        </a>
      </header>

      <BrandForm brand={brand} />
    </div>
  );
}
```

- [ ] **Step 4: Confirm the storefront filter parameter name**

The link uses `?brand=<slug>` — singular. `lib/queries/search-params.ts:112` writes
`params.set("brand", query.brands.join(","))`: the internal field is `brands`, the URL
key is `brand`. Confirm it still is before moving on.

Run: `grep -n "brand" lib/queries/search-params.ts`
Expected: line 112 setting the key `"brand"`. If it changed, correct the `href` to match.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 6: Create a brand through the UI**

With `npm run dev` running, open `http://localhost:3000/admin/brands/new`, create `Verify Co` / `verify-co`, and confirm it appears in the list with 0 products. Then open it, rename it to `Verify Company`, save, and confirm no alert appears (0 products means nothing to repair). Delete it from the row.

- [ ] **Step 7: Commit**

```bash
git add components/admin/brand-form.tsx app/admin/brands/new app/admin/brands/\[id\]
git commit -m "feat: create and edit brands

One form for both modes. The name is a single field rather than a per-locale one —
manufacturer names are proper nouns and the model stores one string for all three
locales; only the description is translated. A rename that touches products reports
how many were reindexed."
```

---

### Task 7: End-to-end verification and documentation

**Files:**
- Modify: `scripts/verify-brands.ts`
- Modify: `README.md` (only if it documents admin sections — check first)

**Interfaces:**
- Consumes: everything above.
- Produces: no new exports.

- [ ] **Step 1: Add the hidden-brand regression check**

The whole reason Task 1 touched `lib/queries/products.ts` is that a hidden brand used to blank its products' name. Lock that in. Append inside the `try` block of `scripts/verify-brands.ts`, after the repair checks:

```ts
    await Brand.updateOne({ _id: brand._id }, { $set: { isActive: false } });

    const { getAllBrands, getAllBrandsIncludingInactive } = await import("../lib/queries/brands");
    const active = await getAllBrands();
    const all = await getAllBrandsIncludingInactive();
    check(
      "a hidden brand is absent from the active list",
      !active.some((b) => b.slug === `${PREFIX}alpha`),
    );
    check(
      "but present in the unfiltered one, so its products keep a name",
      all.some((b) => b.slug === `${PREFIX}alpha`),
    );
```

Note: `getAllBrands` is `cache()`-wrapped for a React request scope; in a plain script each call re-reads, which is what this check needs. If the two reads return identical results because of caching, re-order the check to read `getAllBrands` before the `updateOne`.

- [ ] **Step 2: Run the full script**

Run: `npm run verify:brands`
Expected: `15 checks passed`, and no `zzz-verify-` rows left behind. Confirm with:

Run: `npm run verify:brands` a second time — a clean second run proves the cleanup worked.

- [ ] **Step 3: Browser pass**

With `npm run dev` running and signed in as an admin, walk the list and record the result of each:

1. `/admin/brands` lists all seeded brands with correct product counts, sorted by order.
2. Create a brand; it appears in the list and in the product form's brand select.
3. Create a brand with an existing slug (`karcher`) → inline "Another brand already uses this slug."
4. Create with an empty name → inline "Required."
5. Create with slug `Not A Slug` → inline "Lowercase letters, numbers and single hyphens only."
6. Rename a seeded brand that has products → the alert reports the reindexed count; searching the new name on `/en/search` finds its machines; the old name no longer matches.
7. Rename it back.
8. Delete a brand with products → row shows "N products use this brand…"; the brand is still listed.
9. Delete a brand with no products → it disappears after the refresh.
10. Untick Active on a brand with products → `hidden` badge on the list; the brand is gone from the filter sidebar on `/en/search`; its machines are still listed and still show the brand name on their cards.
11. That hidden brand appears in the product form's select as `Name (hidden)`; open one of its products, change an unrelated field, save, and confirm the brand did not change.
12. Re-tick Active.

- [ ] **Step 4: Update the README if it lists admin sections**

Run: `grep -n "admin" README.md`
If there is a list of panel sections, add Brands to it in the same style. If there is not, skip this step — do not invent documentation.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-brands.ts README.md
git commit -m "test: lock in that hiding a brand does not blank its products

The regression this guards is quiet: the storefront resolved brand names from the
active-only list, so the new Active toggle would have rendered listed products with
no manufacturer at all rather than failing."
```

---

## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| `AdminBrandRow`, `listAdminBrands`, `getAdminBrand` | 1 |
| `getAllBrandsIncludingInactive`, name resolution fix | 1 |
| Product form picker keeps hidden brands, labelled | 2 |
| `brandSchema` | 3 |
| `canDelete`, `repairBrandSearchText`, exported `buildSearchText` | 3 |
| POST / PATCH / DELETE, 409 shape, E11000 handling | 4 |
| Nav entry, list page, row delete with actionable refusal | 5 |
| `new` / `[id]` pages, shared form, repaired-count report | 6 |
| API checks 1-10 and browser checks 11-15 from the spec | 1, 3, 7 |
| `logo` left untouched | Not implemented anywhere — correct |

**Type consistency**

`AdminBrandRow` is defined once in Task 1 and consumed unchanged in Tasks 5 and 6. `canDelete` returns `{ok: false; products: number}` — no `reason` field, unlike the category version — and Task 4's 409 and Task 5's error branch both match that shape. `repairBrandSearchText` returns a bare `number`, surfaced as `repaired` in Task 4's PATCH response and read as `body.repaired` in Task 6's form. `ProductFormOptions.brands` gains `isActive` in Task 2 and is read as `brand.isActive` in the same task.

**Known judgement calls left to the implementer**

Task 4 Step 2 asks the implementer to read `lib/categories/description.ts` and decide whether it is reusable, with a written fallback either way. That is a real fork, not a placeholder — both branches are fully specified.
