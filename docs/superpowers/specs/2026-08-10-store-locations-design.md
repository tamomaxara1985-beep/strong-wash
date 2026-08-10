# Store locations — several branches, each with its own contact details

Date: 2026-08-10

## Problem

The business has more than one location. The site assumes one.

`SiteSettings` holds a single `phone`, `email`, `address` and `workHours`
(`lib/settings/defaults.ts`). The header's utility bar shows that one phone, the
footer shows that one address, and every product page repeats the same number.
There is nowhere to put a second branch.

The header already carries a "Showroom" link with a map-pin icon
(`components/layout/site-header.tsx:61-66`) — pointing at `/c/spare-parts`, a
spare-parts category. It reads as a placeholder waiting for a locations page.

## Scope

A `Location` collection, an `/admin/locations` section to manage it, a `/locations`
page, and the footer and header rewired to read from it. The single contact fields
leave `SiteSettings`.

Out of scope: `LocalBusiness` JSON-LD per branch. Multi-location structured data is
worth doing and belongs with the rest of the structured data in Phase 5 of
`plan.md`, not bolted onto this.

## Data model

```ts
type Location = {
  id: string;
  name: LocalizedString;       // "Tbilisi — Tsereteli"; reads differently in ka
  phone: string;               // one string, as manufacturer names are
  email?: string;
  address: LocalizedString;
  workHours: LocalizedString;
  mapUrl?: string;             // Google Maps, the one deliberately external link
  order: number;
  isActive: boolean;
};
```

`name`, `address` and `workHours` are localized because each genuinely differs per
language. `phone` is one string for the same reason a brand name is: it is not
translated.

`getLocations()` in `lib/queries/locations.ts`, `cache()`-wrapped, filtered to
`isActive`, sorted by `order`.

### The primary location is the first one

The header, the mobile nav and every product page show exactly one phone. That is
the first active location in sort order.

There is deliberately no `isPrimary` flag. A flag can be set on two rows or on
none, and then something still has to decide — so the decision would exist twice.
Sort order already answers it, and it is reorderable.

### The empty case

`DEFAULT_LOCATION` in `lib/settings/defaults.ts`, built from the phone, address and
working hours already constant there. With no location stored, every consumer falls
back to it, exactly as the homepage falls back to its original hero when no banners
exist.

This is what makes the change invisible until the operator adds a real branch, and
it is why no migration script is needed — see below.

## Storefront

**Footer** (`components/layout/site-footer.tsx`). The contact column becomes a list:
each branch's name, its phone as a `tel:` link, and its address. Past two branches
it shows the first two and an "All locations →" link, so the footer cannot grow
without bound as showrooms are added.

**Header** (`components/layout/site-header.tsx`). The "Showroom" link points at
`/locations` instead of `/c/spare-parts`. The phone beside it is the primary
location's.

**Mobile nav and product pages.** Unchanged in behaviour — one phone, now sourced
from the primary location.

**`/locations`.** A card per branch: name, address, working hours, phone, email
when set, and a "Directions" link when a map URL is set. Localised metadata like
every other page. Routing needs no new configuration — `i18n/routing.ts` declares
no localized path names, so `app/[locale]/locations/page.tsx` is enough.

## Admin

`/admin/locations`, following `/admin/brands` and `/admin/slides`: a list with the
name, phone, order and state, edit and delete per row, plus `new` and `[id]` pages
sharing one form.

### `mapUrl` needs its own rule

Every other user-supplied URL on this site is forced to stay internal —
`isSiteRelativePath` in `lib/slides/validate.ts` exists precisely to stop a banner
becoming an off-site link. A map link is the opposite: it must leave the site.

So it gets a narrow rule of its own rather than reusing either existing one:
`https:` only, and the host must be one of `google.com`, `www.google.com`,
`maps.google.com`, `goo.gl` or `maps.app.goo.gl`. Rendered with
`rel="noopener noreferrer"`. Anything else is refused with a message naming what is
allowed.

An allowlist rather than "any https URL" because this field renders as a link on a
public page, and "paste a link here" is the shape of every open-redirect that ever
shipped.

### Deleting the last location is refused

With none stored, every consumer falls back to `DEFAULT_LOCATION` — so an operator
who deleted their only branch would watch the old hardcoded Tsereteli address
reappear as if by magic, with nothing having failed. The refusal says: this is your
only location, add another first, or untick Active.

## What leaves `SiteSettings`

`phone`, `email`, `address` and `workHours` come out of the model, the Zod schema,
`ResolvedSettings`, `DEFAULT_SETTINGS`, and the settings form's Contact section.
The brand colours and the font key stay, and `getSiteSettings` keeps serving them.

`/admin/settings` becomes Colours and Typography, with a line pointing at
`/admin/locations` for contact details — otherwise an operator hunts for the phone
field where it used to be.

### No migration script

The `sitesettings` collection is currently empty, so there is nothing stored to
move. The values that would be migrated are constants in `DEFAULT_SETTINGS`, and
they become `DEFAULT_LOCATION`.

Stated plainly because it will not stay true: if contact details are saved through
`/admin/settings` before this ships, those saved values are dropped when the fields
leave the model. That is an argument for doing this now rather than after the
fields are filled in.

## Testing

No test runner exists in this repository; the three features before this shipped
verified by a script plus a browser pass, and this follows that.

`scripts/verify-locations.ts`:

1. Locations come back ordered by `order`.
2. An inactive location is absent from `getLocations()`.
3. With none stored, the resolved list is the single `DEFAULT_LOCATION`.
4. The primary is the first by order, and changing `order` changes which.
5. The map-URL rule accepts `https://maps.google.com/...`, `https://goo.gl/maps/...`
   and `https://maps.app.goo.gl/...`.
6. It refuses `http://maps.google.com/...`, `https://evil.example/maps`,
   `https://google.com.evil.example/`, `javascript:alert(1)` and an empty string.
7. Deleting the only location is refused; deleting one of two succeeds.
8. An unset `en` name falls back to Georgian through `pickLocale`.

Browser pass:

9. With no locations stored, the footer and header look exactly as they do today.
10. One location: the footer shows it, no "All locations" link.
11. Two: both shown, still no link.
12. Four: first two shown plus the link, which reaches `/locations`.
13. `/locations` renders every active branch in all three locales, with hours and a
    working Directions link.
14. The header's "Showroom" link reaches `/locations`.
15. Deactivating a branch removes it from the footer and `/locations` but leaves it
     in the admin list.
16. Deleting the only location is refused with the message naming the alternative.
17. A map URL on a non-Google host is refused in the form.

## A note on repetition

This is the fourth admin section built to the same list / new / edit / row-delete
shape. Brands, banners and locations are near-identical modulo their fields.

At four it is worth extracting a shared table and form scaffold. That is its own
piece of work with its own risk, and doing it inside this feature would mean
refactoring three shipped sections while adding a fourth. Noted here so it is a
decision rather than an accident.
