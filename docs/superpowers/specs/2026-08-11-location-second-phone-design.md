# A second phone number per branch

Date: 2026-08-11

## Problem

`StoreLocation` holds one `phone` (`lib/models/store-location.ts:19`), required. A
branch with two lines — a landline and a mobile, a showroom desk and a service desk
— has nowhere to put the second one.

## Scope

One optional field, `phone2`, on `StoreLocation`. It is displayed on `/locations`
and nowhere else on the storefront.

Out of scope, deliberately:

- **Labelling the second number.** Both numbers reach the same branch, so which one
  a visitor taps does not matter. A label is prose, and prose here would need the
  `ka`/`en`/`ru` treatment `name` and `address` get — a localized subdocument and
  three more form inputs to say "Mobile".
- **A third number.** Two fixed fields, not an array. An array would change every
  `location.phone` read in the codebase into `location.phones[0]` and turn the form
  input into add/remove rows, to support a case nobody has asked for.
- **The header, the mobile nav and the product page.** Each has exactly one slot for
  a number: the header's utility bar, the drawer's footer row, and the product
  page's call button beside the quote dialog. Two numbers in a single-action slot is
  a coin toss rather than a choice — the same reasoning that made the product page's
  call button show the number instead of a second "Request a quote".
- **The site footer.** It already lists up to three branches with a name, a number
  and an address each. Doubling the numbers doubles the tallest thing in that
  column for a number that is one click away on `/locations`.

## Data model

```ts
type StoreLocation = {
  // …unchanged…
  phone: string;    // primary — what the header, nav and product pages show
  phone2?: string;  // optional second number, shown on /locations only
};
```

`phone2` is a plain string for the same reason `phone` is: a telephone number is not
translated.

Optional, so there is no migration. An existing row without the field reads as
`undefined`, which is exactly "this branch has one number".

`DEFAULT_LOCATION` (`lib/locations/defaults.ts`) gains nothing. It represents the
site as it shipped, and the site shipped with one number.

### Validation

`locationSchema` (`lib/auth/schemas.ts:248`):

```ts
phone2: z.string().trim().min(3, "phone_too_short").max(40).optional().or(z.literal("")),
```

An empty box means "no second number", the same way it does for `email` and
`mapUrl`. The `min(3)` catches a half-typed number rather than storing `+9`.

### A duplicate is refused

Both route handlers reject `phone2` when it equals `phone` after stripping spaces,
with the field code `same_as_phone`. The same number rendered twice on a card reads
as a bug, and the fix the operator wants is an empty box.

## Read path

`toStoreLocation` (`lib/queries/map.ts:108`):

```ts
phone2: doc.phone2?.trim() || undefined,
```

No `DEFAULT_LOCATION` fallback. `phone` has one because a page with no telephone
number on it is worse than a page with a stale one; an absent second number is
simply the normal case.

The mapper also drops `phone2` when it matches `phone`. The route handlers already
refuse that, but they cannot vouch for a document they did not write — a legacy row,
an imported dump or a restored backup can carry anything. This is the same
belt-and-braces re-check `mapUrl` gets two lines below, for the same reason: a bad
stored value should degrade to the single-number card, not to a visibly doubled one.

`LeanStoreLocation` gains `phone2?: string | null`. `AdminLocationRow` and
`listAdminLocations` (`lib/queries/admin.ts:386`) carry `phone2` through the same
`trim() || undefined` normalisation.

## Storefront

`/locations` (`app/[locale]/locations/page.tsx:52-58`): a second `tel:` anchor
immediately after the first, identical markup and classes, rendered only when
`phone2` is set. No new translation keys — the card has no phone label today, and
the icon carries the meaning.

## Admin

**The form** (`components/admin/location-form.tsx:156`). `phone2` sits directly
after `phone` in the two-column section. `order` moves up beside `email` so no row
is left half-empty; `mapUrl` stays last, spanning both columns. Resulting rows:

1. `phone` | `phone2`
2. `email` | `order`
3. `mapUrl` (full width)

The hint under `phone` currently reads "Not translated — one number.", which stops
being true. It becomes "Primary — the number the header and product pages show.",
and `phone2` gets "Optional. Shown on the locations page only." Between them they
tell the operator why the two fields are not interchangeable.

`messageFor` gains two codes:

- `phone_too_short` → "A number needs at least 3 characters, or leave it empty."
- `same_as_phone` → "Same as the primary number. Leave it empty instead."

**The list** (`app/admin/locations/page.tsx:57`). `phone2` renders under `phone` in
the existing Phone cell, muted and smaller — the same muted `text-xs` the Name cell
uses for its "primary" tag. No new column: the table is already six columns wide and
scrolls horizontally on narrow screens, so it should not grow a seventh for a field
most rows leave empty.

## Testing

No test runner exists in this repository; locations shipped verified by
`scripts/verify-locations.ts` plus a browser pass, and this follows that.

Script checks, added to the existing file:

1. A fixture with `phone2` set comes back through `getLocations()` with it intact.
2. A fixture without `phone2` comes back with `phone2 === undefined` — not `""`,
   which would render an empty anchor.
3. A fixture whose `phone2` equals its `phone` comes back with `phone2` dropped.

Browser pass:

4. `/locations` shows both numbers on a branch that has two, and one on a branch
   that has one, in all three locales.
5. Both anchors dial: the second `tel:` href has its spaces stripped like the first.
6. The header, the mobile nav, the footer and a product page still show exactly one
   number — the primary branch's `phone`.
7. Saving `phone2` equal to `phone` is refused in the form with the message naming
   the alternative.
8. Saving a two-character `phone2` is refused; clearing the box saves and removes
   the second number from the card.
