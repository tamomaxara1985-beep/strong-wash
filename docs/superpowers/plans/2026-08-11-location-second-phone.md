# Second Phone Number Per Branch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each branch an optional second telephone number, entered at `/admin/locations` and shown on the `/locations` page.

**Architecture:** One optional `phone2` string on the existing `StoreLocation` model — not an array, so no existing `location.phone` read changes anywhere. A pure `isSamePhone` helper beside `isMapUrl` is the single place the "the second number repeats the first" rule lives; both route handlers refuse that on write and the read mapper drops it on read, the same belt-and-braces pattern `mapUrl` already has. Only `/locations` renders the second number; the header, mobile nav, footer and product page keep showing exactly one.

**Tech Stack:** Next.js 16 (App Router, `RouteContext` typed helpers), React 19, Mongoose 9, Zod 4, Tailwind v4, next-intl (storefront only), lucide-react, tsx for scripts.

**Spec:** `docs/superpowers/specs/2026-08-11-location-second-phone-design.md`

## Global Constraints

- **Read the Next.js docs first.** `AGENTS.md` requires it — this version has breaking changes versus training data. Guides are in `node_modules/next/dist/docs/`. This plan touches two existing route handlers; do not change their `RouteContext<"/api/admin/locations/[id]">` signatures or the `await context.params` shape.
- **`phone2` is optional everywhere.** `phone` stays required. An empty box means "this branch has one number", exactly as it does for `email` and `mapUrl`.
- **`phone2` is a plain string, never localized.** A telephone number is not translated, the same reason `phone` is one string.
- **No label, no new translation keys.** The second number renders as a bare number behind the same `Phone` icon.
- **`/locations` is the only storefront surface that changes.** `components/layout/site-header.tsx`, `components/layout/mobile-nav.tsx`, `components/layout/footer-locations.tsx` and `app/[locale]/p/[slug]/page.tsx` must be left untouched — each has one slot for one number.
- **`DEFAULT_LOCATION` gains nothing.** It represents the site as it shipped, and the site shipped with one number.
- **No migration.** The field is optional; an existing row without it reads as `undefined`.
- **The admin tree is unlocalised, English-only.** No `next-intl` imports in `/admin` pages or components.
- **Error shapes come from `@/lib/api`:** `validationError({field: code})`, `apiError(error)` in every catch. Field codes used here: `phone_too_short`, `same_as_phone`.
- **No test runner exists in this repo and adding one is forbidden.** Verification is `npx tsc --noEmit`, `npm run lint`, `npm run verify:locations` and a browser pass. `npm run build` before the final commit.
- **`npm run verify:locations` writes to whatever `MONGODB_URI` points at.** Every fixture carries the `zzz-verify-location` marker in `name.ka` and is removed in the `finally`.
- **If the verify script fails with a DNS/SRV lookup error** against Atlas, run it through a resolver shim rather than changing any repo file. Write `<scratchpad>/dns-fix.cjs` containing:
  ```js
  const dns = require("node:dns");
  dns.setServers(["1.1.1.1", "8.8.8.8"]);
  ```
  then run `npx tsx --require <scratchpad>/dns-fix.cjs scripts/verify-locations.ts`.
- **Commit after every task.** Conventional Commits, English prose.

---

## File Structure

**Modify:**
- `lib/models/store-location.ts` — the `phone2` field.
- `lib/types.ts` — `phone2?: string` on the `StoreLocation` read type.
- `lib/locations/validate.ts` — gains `isSamePhone`, the duplicate rule. Pure, so the routes, the mapper and the verify script all share one implementation.
- `lib/queries/map.ts` — `toStoreLocation` reads and sanitises `phone2`.
- `lib/queries/admin.ts` — `AdminLocationRow` and `listAdminLocations` carry `phone2`.
- `lib/auth/schemas.ts` — `locationSchema` gains `phone2`.
- `app/api/admin/locations/route.ts` — POST writes it, refuses a duplicate.
- `app/api/admin/locations/[id]/route.ts` — PATCH writes it, refuses a duplicate.
- `components/admin/location-form.tsx` — the input, the hint rewrite, two new error messages.
- `app/admin/locations/page.tsx` — the second line in the Phone cell.
- `app/[locale]/locations/page.tsx` — the second `tel:` anchor.
- `scripts/verify-locations.ts` — checks for all of the above.

**Create:** nothing.

---

### Task 1: Store and read the field

The data layer end to end: the field exists, comes back through `getLocations()`, and a stored value that repeats the primary number is dropped on the way out.

**Files:**
- Modify: `lib/models/store-location.ts:5-29`, `lib/types.ts:51-60`, `lib/locations/validate.ts:32`, `lib/queries/map.ts:96-125`, `lib/queries/admin.ts:386-429`, `scripts/verify-locations.ts:28-37,119`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `isSamePhone(phone: string, other: string): boolean` from `lib/locations/validate.ts` — Task 2 imports it in both route handlers.
  - `phone2?: string` on the `StoreLocation` type in `lib/types.ts` — Task 3's `/locations` page reads it.
  - `phone2?: string` on `AdminLocationRow` in `lib/queries/admin.ts` — Task 3's form and admin table read it.
  - `phone2` on the Mongoose schema — Task 2's handlers assign it.

- [ ] **Step 1: Write the failing checks in the verify script**

In `scripts/verify-locations.ts`, give `fixture` an optional fourth parameter. Replace the existing function (lines 28-37) with:

```ts
function fixture(suffix: string, order: number, isActive = true, phone2?: string) {
  return {
    name: { ka: `${MARKER} ${suffix}` },
    phone: "+995 000 00 00 00",
    phone2,
    address: { ka: `მისამართი ${suffix}` },
    workHours: { ka: "ორშ–შაბ 10:00–18:00" },
    order,
    isActive,
  };
}
```

Then insert this block immediately after the `isMapUrl` refusal loop (after line 119, the `for (const bad of [...])` loop's closing brace) and before the comment beginning `// The PATCH and DELETE active-count guards`:

```ts
    const { isSamePhone } = await import("../lib/locations/validate");

    check("isSamePhone ignores spacing", isSamePhone("+995 322 40 40 40", "+995322404040"));
    check(
      "isSamePhone tells two different numbers apart",
      !isSamePhone("+995 322 40 40 40", "+995 599 11 22 33"),
    );
    check(
      "isSamePhone treats an empty second number as no duplicate",
      !isSamePhone("+995 322 40 40 40", ""),
    );

    // A second number is optional, so all three states have to be checked: set,
    // absent, and set to the same number as the primary — which the mapper
    // drops, because a card showing one number twice reads as a bug.
    await cleanup();
    await StoreLocation.create(fixture("two-numbers", 10, true, "+995 599 11 22 33"));
    await StoreLocation.create(fixture("one-number", 20));
    await StoreLocation.create(fixture("dupe", 30, true, "+995 000 00 00 00"));

    const phoneRows = (await stored()).filter((l) => l.name.ka.includes(MARKER));
    const bySuffix = (suffix: string) => phoneRows.find((l) => l.name.ka.endsWith(suffix));

    check(
      "a stored second number comes back through the mapper",
      bySuffix("two-numbers")?.phone2 === "+995 599 11 22 33",
    );
    check(
      "an absent second number stays undefined rather than an empty string",
      bySuffix("one-number")?.phone2 === undefined,
    );
    check(
      "a second number equal to the first is dropped on read",
      bySuffix("dupe")?.phone2 === undefined,
    );
```

`stored` is the `getLocations` reference already bound at line 79; `cleanup()` here clears the earlier ordering fixtures so the three new rows are the only marker rows.

- [ ] **Step 2: Run the checks to verify they fail**

Run: `npm run verify:locations`

Expected: FAIL. First failure is `FAILED: isSamePhone ignores spacing` — `isSamePhone` is not exported yet, so the import throws or the check fails. (If `tsc` in the script's path complains about the unknown `phone2` property first, that is the same failure for the same reason.)

- [ ] **Step 3: Add `isSamePhone` to the validation module**

Append to `lib/locations/validate.ts`:

```ts
/**
 * Whether a branch's second number merely repeats its first.
 *
 * Spacing is ignored: "+995 322 40 40 40" and "+995322404040" are one number
 * typed two ways, and refusing only the byte-identical case would let the
 * duplicate through.
 *
 * An empty second value is never a duplicate — it means "this branch has one
 * number", which is the normal case and must stay saveable.
 */
export function isSamePhone(phone: string, other: string): boolean {
  const strip = (value: string) => value.replace(/\s/g, "");
  const stripped = strip(other);
  if (!stripped) return false;
  return strip(phone) === stripped;
}
```

- [ ] **Step 4: Add the field to the model**

In `lib/models/store-location.ts`, add the field directly after `phone` (line 19):

```ts
    phone: { type: String, required: true, trim: true },
    /** Optional second line for the same branch. Shown on /locations only. */
    phone2: { type: String, trim: true },
```

And extend the file's doc comment so the next reader learns the split rather than inferring it. Replace the second paragraph (lines 8-10) with:

```
 * `phone` is the primary number — the one the header, the mobile nav and every
 * product page show. `phone2` is optional and appears on the locations page
 * only, because those three surfaces each have one slot for one number. Both are
 * single strings for the same reason a brand name is: a telephone number is not
 * translated. `name`, `address` and `workHours` are localized because each
 * genuinely reads differently per language.
```

- [ ] **Step 5: Add the field to the read type**

In `lib/types.ts`, in the `StoreLocation` type, add after `phone` (line 54):

```ts
  phone: string;
  /** Optional second number for the same branch; rendered on /locations only. */
  phone2?: string;
```

- [ ] **Step 6: Read the field in the mapper**

In `lib/queries/map.ts`, add `phone2` to `LeanStoreLocation` after `phone` (line 99):

```ts
  phone: string;
  phone2?: string | null;
```

Import the new helper by extending the existing import on line 4:

```ts
import { isMapUrl, isSamePhone } from "../locations/validate";
```

Then in `toStoreLocation`, after the `phone` line (line 113):

```ts
    phone: doc.phone?.trim() || DEFAULT_LOCATION.phone,
    // No DEFAULT_LOCATION fallback here: `phone` has one because a page with no
    // telephone number is worse than one with a stale number, whereas an absent
    // second number is simply the normal case.
    //
    // Dropped when it repeats the primary. The write handlers already refuse
    // that, but they cannot vouch for a document they did not write — a legacy
    // row, an imported dump or a restored backup can carry anything, and the
    // failure mode is a visibly doubled line on a public page.
    phone2:
      phone2 && !isSamePhone(doc.phone?.trim() || DEFAULT_LOCATION.phone, phone2)
        ? phone2
        : undefined,
```

with `phone2` computed beside the existing `mapUrl` local at the top of the function (line 109):

```ts
  const mapUrl = doc.mapUrl?.trim();
  const phone2 = doc.phone2?.trim();
```

- [ ] **Step 7: Carry the field through the admin query**

In `lib/queries/admin.ts`, add to `AdminLocationRow` after `phone` (line 389):

```ts
  phone: string;
  phone2?: string;
```

and in `listAdminLocations`, after the `phone` mapping (line 413):

```ts
    phone: doc.phone,
    phone2: doc.phone2?.trim() || undefined,
```

The admin row is deliberately *not* duplicate-filtered the way `toStoreLocation` is: the panel's job is to show the operator what is actually stored, including a bad value they need to see in order to fix.

- [ ] **Step 8: Run the checks to verify they pass**

Run: `npx tsc --noEmit`
Expected: no output.

Run: `npm run verify:locations`
Expected: every check prints `ok`, ending in `N checks passed` with N six higher than before this task.

- [ ] **Step 9: Commit**

```bash
git add lib/models/store-location.ts lib/types.ts lib/locations/validate.ts lib/queries/map.ts lib/queries/admin.ts scripts/verify-locations.ts
git commit -m "feat: store an optional second phone number per branch"
```

---

### Task 2: Accept the field on write

The two admin handlers save `phone2`, clear it when the box is emptied, and refuse a value that repeats the primary number.

**Files:**
- Modify: `lib/auth/schemas.ts:240-260`, `app/api/admin/locations/route.ts:19-40`, `app/api/admin/locations/[id]/route.ts:27-65`, `scripts/verify-locations.ts`

**Interfaces:**
- Consumes: `isSamePhone(phone: string, other: string): boolean` from `lib/locations/validate.ts`, and the `phone2` model field — both from Task 1.
- Produces: `locationSchema` parsing `phone2` as `string | undefined`, with the field codes `phone_too_short` and `same_as_phone` — Task 3's form renders messages for both.

- [ ] **Step 1: Write the failing checks in the verify script**

In `scripts/verify-locations.ts`, insert immediately after the three `isSamePhone` checks added in Task 1:

```ts
    const { locationSchema } = await import("../lib/auth/schemas");

    const submission = (phone2: unknown) => ({
      name: { ka: "ფილიალი" },
      phone: "+995 322 40 40 40",
      phone2,
      address: { ka: "მისამართი" },
      workHours: { ka: "ორშ–შაბ 10:00–18:00" },
      order: 0,
      isActive: true,
    });

    check(
      "the schema accepts a second number",
      locationSchema.safeParse(submission("+995 599 11 22 33")).success,
    );
    check(
      "the schema accepts an empty second number — the box the operator left blank",
      locationSchema.safeParse(submission("")).success,
    );
    check(
      "the schema accepts an absent second number",
      locationSchema.safeParse(submission(undefined)).success,
    );

    const tooShort = locationSchema.safeParse(submission("+9"));
    check("the schema refuses a half-typed second number", !tooShort.success);
    check(
      "and reports it as phone_too_short, the code the form explains",
      tooShort.success === false &&
        tooShort.error.issues.some(
          (issue) => issue.path.join(".") === "phone2" && issue.message === "phone_too_short",
        ),
    );
```

- [ ] **Step 2: Run the checks to verify they fail**

Run: `npm run verify:locations`

Expected: FAIL with `FAILED: the schema refuses a half-typed second number` — with no `phone2` rule, Zod strips the unknown key and every submission parses, including `"+9"`.

- [ ] **Step 3: Add the schema rule**

In `lib/auth/schemas.ts`, add to `locationSchema` after `phone` (line 250):

```ts
  phone: z.string().trim().min(3, "required").max(40),
  // Optional: an empty box means "this branch has one number". `min(3)` still
  // applies to a non-empty value, so a half-typed "+9" is refused rather than
  // stored.
  phone2: z.string().trim().min(3, "phone_too_short").max(40).optional().or(z.literal("")),
```

Extend the schema's doc comment (lines 240-247) so the two fields are distinguished. Replace its first paragraph with:

```
 * `name`, `address` and `workHours` are `localizedRequired`: a branch a visitor
 * cannot name or find is not worth listing. `phone` is one required string and
 * `phone2` one optional string, as a telephone number is not translated.
 *
 * The map-host rule and the "the second number repeats the first" rule are both
 * enforced in the route handlers rather than here, so each can report a field
 * code the form explains.
```

- [ ] **Step 4: Run the checks to verify they pass**

Run: `npm run verify:locations`
Expected: every check prints `ok`, five more than after Task 1.

- [ ] **Step 5: Write it in the POST handler**

In `app/api/admin/locations/route.ts`, extend the import on line 8:

```ts
import { isMapUrl, isSamePhone } from "@/lib/locations/validate";
```

After the `mapUrl` check (lines 23-24), add:

```ts
    const mapUrl = parsed.data.mapUrl?.trim();
    if (mapUrl && !isMapUrl(mapUrl)) return validationError({ mapUrl: "map_host" });

    // The same number on both lines renders twice on the branch card, which
    // reads as a bug. What the operator wants is an empty box.
    const phone2 = parsed.data.phone2?.trim();
    if (phone2 && isSamePhone(parsed.data.phone, phone2)) {
      return validationError({ phone2: "same_as_phone" });
    }
```

and in the `new StoreLocation({...})` literal, after `phone` (line 30):

```ts
      phone: parsed.data.phone,
      phone2: phone2 || undefined,
```

- [ ] **Step 6: Write it in the PATCH handler**

In `app/api/admin/locations/[id]/route.ts`, extend the import on line 9:

```ts
import { isMapUrl, isSamePhone } from "@/lib/locations/validate";
```

After the `mapUrl` check (lines 30-31), add the identical guard:

```ts
    const mapUrl = parsed.data.mapUrl?.trim();
    if (mapUrl && !isMapUrl(mapUrl)) return validationError({ mapUrl: "map_host" });

    // The same number on both lines renders twice on the branch card, which
    // reads as a bug. What the operator wants is an empty box.
    const phone2 = parsed.data.phone2?.trim();
    if (phone2 && isSamePhone(parsed.data.phone, phone2)) {
      return validationError({ phone2: "same_as_phone" });
    }
```

and in the assignment block, after `location.phone` (line 58):

```ts
    location.phone = parsed.data.phone;
    // `undefined` unsets the path on save, which is how emptying the box removes
    // the second number — the same pattern `email` and `mapUrl` use below.
    location.phone2 = phone2 || undefined;
```

- [ ] **Step 7: Verify the whole write path compiles and the checks still pass**

Run: `npx tsc --noEmit`
Expected: no output.

Run: `npm run lint`
Expected: no errors.

Run: `npm run verify:locations`
Expected: every check prints `ok`.

- [ ] **Step 8: Commit**

```bash
git add lib/auth/schemas.ts app/api/admin/locations/route.ts "app/api/admin/locations/[id]/route.ts" scripts/verify-locations.ts
git commit -m "feat: accept and validate a branch's second phone number"
```

---

### Task 3: Enter it and show it

The operator can type the second number, sees why the two fields differ, and it appears on `/locations`.

**Files:**
- Modify: `components/admin/location-form.tsx:17-28,43-64,83-92,156-224`, `app/admin/locations/page.tsx:57`, `app/[locale]/locations/page.tsx:52-58`

**Interfaces:**
- Consumes: `phone2?: string` on `AdminLocationRow` and on the `StoreLocation` type (Task 1); the `phone_too_short` and `same_as_phone` field codes (Task 2).
- Produces: nothing — this is the last task.

- [ ] **Step 1: Add the two error messages to the form**

In `components/admin/location-form.tsx`, add two cases to `messageFor` (after line 23):

```ts
    case "phone_too_short":
      return "A number needs at least 3 characters, or leave it empty.";
    case "same_as_phone":
      return "Same as the primary number. Leave it empty instead.";
```

- [ ] **Step 2: Add the field to the form's draft state**

In the `useState` initialiser, after `phone` (line 49):

```ts
    phone: location?.phone ?? "",
    phone2: location?.phone2 ?? "",
```

and in the `payload` built in `submit`, after `phone` (line 85):

```ts
      phone: draft.phone,
      phone2: draft.phone2,
```

- [ ] **Step 3: Add the input and rewrite the hints**

In the first `<section>` (lines 156-225), the fields become `phone | phone2`, `email | order`, then `mapUrl` spanning both columns, so no row is left half-empty. Replace the existing `phone` block (lines 157-172) with:

```tsx
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
            <p className="text-muted-foreground text-xs">
              Primary — the number the header and product pages show.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone2">Second phone (optional)</Label>
          <Input
            id="phone2"
            value={draft.phone2}
            onChange={(event) => setDraft({ ...draft, phone2: event.target.value })}
            aria-invalid={Boolean(fieldError("phone2"))}
            className="text-data h-10"
          />
          {fieldError("phone2") ? (
            <p className="text-destructive text-xs">{fieldError("phone2")}</p>
          ) : (
            <p className="text-muted-foreground text-xs">Shown on the locations page only.</p>
          )}
        </div>
```

Then move the `order` block (lines 210-224) so it sits immediately after the `email` block, leaving `mapUrl` (with its `sm:col-span-2`) last in the section. The three blocks keep their existing markup exactly; only their order changes.

Finally, update the component's doc comment (lines 30-35) — it currently says "the phone is not, because a telephone number is not translated", which no longer describes two fields:

```
/**
 * One form for creating and editing a branch.
 *
 * Name, address and hours are per-language. Neither phone is: a telephone number
 * is not translated. The first is the primary, shown across the site; the second
 * is optional and appears on the locations page only.
 */
```

- [ ] **Step 4: Show it in the admin list**

In `app/admin/locations/page.tsx`, replace the Phone cell (line 57):

```tsx
                <td className="px-3 py-2">
                  <div className="text-data">{location.phone}</div>
                  {location.phone2 ? (
                    <div className="text-data text-muted-foreground text-xs">
                      {location.phone2}
                    </div>
                  ) : null}
                </td>
```

No new column: the table is already six columns wide and scrolls horizontally on narrow screens.

- [ ] **Step 5: Show it on the locations page**

In `app/[locale]/locations/page.tsx`, after the existing phone anchor (lines 52-58) and before the `location.email` block:

```tsx
            {location.phone2 ? (
              <a
                href={`tel:${location.phone2.replace(/\s/g, "")}`}
                className="text-data hover:text-primary inline-flex items-center gap-2 text-sm font-semibold transition-colors"
              >
                <Phone aria-hidden className="size-4 shrink-0" />
                {location.phone2}
              </a>
            ) : null}
```

Identical markup to the first anchor, including the space-stripping in the `tel:` href — a number with spaces in the href does not dial on some Android dialers.

- [ ] **Step 6: Verify it compiles, lints and builds**

Run: `npx tsc --noEmit`
Expected: no output.

Run: `npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

Run: `npm run verify:locations`
Expected: every check prints `ok`.

- [ ] **Step 7: Browser pass**

Run `npm run dev`, then confirm each of these by hand:

1. `/admin/locations/new` shows Phone and "Second phone (optional)" side by side, with Email and Sort order on the next row and Map link spanning the width below them.
2. Creating a branch with both numbers succeeds; `/locations` shows both, each behind a phone icon.
3. A branch with only Phone filled in shows exactly one number on `/locations` — no empty second line.
4. Both anchors dial: inspect each `href` and confirm it is `tel:` with no spaces.
5. `/locations` renders correctly in all three locales (`/ka/locations`, `/en/locations`, `/ru/locations`) — the numbers are identical in each, only the surrounding text changes.
6. Saving `phone2` equal to `phone` (try it with different spacing, e.g. `+995 322 40 40 40` against `+995322404040`) is refused in the form with "Same as the primary number. Leave it empty instead."
7. Saving a two-character `phone2` is refused with "A number needs at least 3 characters, or leave it empty."
8. Emptying the second-phone box on an existing branch saves, and the second line disappears from both `/locations` and the admin list.
9. The admin list shows the second number under the first, muted and smaller.
10. Unchanged, each still showing exactly one number: the header utility bar, the mobile nav drawer's footer row, the site footer's branch list, and a product page's call button.

- [ ] **Step 8: Commit**

```bash
git add components/admin/location-form.tsx app/admin/locations/page.tsx "app/[locale]/locations/page.tsx"
git commit -m "feat: enter and display a branch's second phone number"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| `phone2` on the model, no migration | 1 (Step 4) |
| `phone2?: string` on the read type | 1 (Step 5) |
| Zod rule with `phone_too_short` | 2 (Step 3) |
| Duplicate refused on write, both handlers | 2 (Steps 5-6) |
| Mapper reads it, no `DEFAULT_LOCATION` fallback, drops a duplicate | 1 (Step 6) |
| `LeanStoreLocation`, `AdminLocationRow`, `listAdminLocations` | 1 (Steps 6-7) |
| Form input, field order, hint rewrites, two messages | 3 (Steps 1-3) |
| Admin list second line | 3 (Step 4) |
| `/locations` second anchor | 3 (Step 5) |
| `DEFAULT_LOCATION` untouched; header, nav, footer, product page untouched | Global Constraints; browser check 10 |
| Three script checks (set / absent / duplicate) | 1 (Step 1) |
| Browser pass | 3 (Step 7) |

**One addition beyond the spec:** the spec says both handlers reject a duplicate, without saying where the comparison lives. This plan puts it in `isSamePhone` in `lib/locations/validate.ts` so the two handlers, the mapper and the verify script share one implementation — the same shape `isMapUrl` already has, and it makes the rule directly checkable without invoking a route.

**Type consistency:** `phone2` is the property name in the model, `lib/types.ts`, `LeanStoreLocation`, `AdminLocationRow`, the Zod schema, the form draft, the payload and the field-error keys — one name throughout. `isSamePhone(phone, other)` is called with that argument order in the mapper, both handlers and the script.
