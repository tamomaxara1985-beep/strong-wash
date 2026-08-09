# Homepage hero carousel

Date: 2026-08-09

## Problem

The homepage opens with a two-column hero: the brand lockup, a translated
headline, a subtitle and two buttons on the left, and the first featured product
with its spec strip on the right (`app/[locale]/page.tsx:56-121`).

The operator has a set of designed promotional banners — the kind already used on
social media, carrying a headline, benefit list and contact details inside the
artwork — and no way to put them on the site. Everything above the fold is
compiled in.

## Scope

Replace the hero section with a scrollable carousel of admin-managed banners, and
add the `/admin/slides` section that manages them.

Out of scope: the rest of the homepage. Categories, featured products, sale
products and the brand strip stay exactly as they are.

## What the images are

The supplied banners are finished artwork, not photographs. Three consequences
run through this design:

1. **The text is inside the picture.** A screen reader, a search engine and a
   visitor with images disabled get nothing from the image itself, so `alt` is
   the entire accessible content of a slide — required, not optional.
2. **They are in Georgian.** The site serves ka, en and ru. One image per slide
   is shown to every locale; an English or Russian visitor sees the Georgian
   banner. This is a deliberate trade — the buyers are in Georgia and everything
   below the fold is translated — and the model can grow a per-locale image later
   without redesigning anything.
3. **They are different shapes and their text runs close to the edges.** Two are
   square, the rest wider. Cropping would cut headlines and the printed phone
   number, so nothing is ever cropped.

## Data model

A new `HeroSlide` collection, shaped like `Brand`:

```ts
type HeroSlide = {
  image: string;          // Cloudinary URL, chosen from the media library
  alt: LocalizedString;   // ka required; en/ru fall back to ka
  href?: string;          // optional, site-relative, e.g. "/c/sand-washing"
  width?: number;         // copied from the media asset
  height?: number;
  order: number;
  isActive: boolean;
};
```

`width` and `height` are copied from the chosen media asset rather than measured
at render time: `next/image` needs the intrinsic ratio to reserve space, and
without it the page reflows as each banner loads — on the largest element above
the fold.

`getHeroSlides()` in `lib/queries/slides.ts`, `cache()`-wrapped, filtered to
`isActive`, sorted by `order`.

### The empty case is load-bearing

With no active slides the homepage renders the existing hero unchanged. That is
what makes this change reversible without a deploy: deactivate every slide and
the old hero comes back. It also covers the window between shipping the code and
uploading the first banner, and any future state where an operator clears the
list.

## The carousel

`components/home/hero-carousel.tsx`, a client component receiving resolved slides
as props. The page performs the query; the component only handles interaction.

### Mechanism

Native CSS scroll-snap: a horizontal `overflow-x-auto` track with
`scroll-snap-type: x mandatory` and each slide `scroll-snap-align: center`.

Swipe, trackpad flick, and keyboard scrolling come from the browser. The arrows
call `scrollBy` with the container's width; an `IntersectionObserver` on the
slides decides which dot is current; autoplay calls the same `scrollBy` the
arrows do. No new dependency, and with JavaScript broken the markup degrades to a
scrollable strip of images rather than an empty box.

A library was considered and rejected: it would add mouse-drag on desktop, which
native scrolling does not give, in exchange for a dependency and a worse failure
mode.

### Fitting

One band, `aspect-[4/3]` below the `sm` breakpoint and `aspect-[16/9]` from `sm`
up. Every image is `object-contain` on a `bg-brand-black` backdrop.

Nothing is cropped at any width; only the amount of black beside a squarer banner
changes. The backdrop is the brand's own black, so the letterboxing reads as
deliberate.

### Behaviour

- **Autoplay** every 6 seconds. It pauses on pointer-over, when focus is anywhere
  inside the carousel, and when the tab is hidden; it does not run at all when
  the visitor's system asks to reduce motion. At the last slide it returns to the
  first.
- **Arrows and dots**, both real buttons, both keyboard-reachable. The dots also
  communicate how many banners exist, which a still carousel otherwise hides.
- **A slide may link** to a site-relative path. A slide without one is a plain
  image, not a dead link.
- **A single slide** renders as one image with no arrows, dots or autoplay.
  Controls for a one-item carousel are noise.

### Accessibility

The region carries `aria-roledescription="carousel"` and a translated label; each
slide is a group labelled "N of M"; the current dot carries `aria-current`. The
arrows have translated labels rather than bare glyphs.

`alt` is the whole accessible content of a slide, for the reason given above. The
admin form therefore refuses an empty Georgian alt, the same way every other
localized required field in this codebase does.

## Homepage integration

`getHeroSlides()` joins the existing `Promise.all` in `app/[locale]/page.tsx:32`,
so it adds no round trip. When it returns slides, the carousel replaces the whole
hero `<section>`; when it returns none, that section renders as it does today.

The first slide loads with `priority`; the rest are lazy. It is the largest
element above the fold and decides the perceived load time.

Images are served from Cloudinary, whose delivery path is already allowed in
`next.config.ts` `remotePatterns`, so `next/image` resizes them — the 1080×1080
originals do not reach a phone at full size.

`featured` is still needed by the products grid further down the page and stays.
But `hero`, `heroSpecs`, `specLabels` and the `getSpecSchemaLookup()` read exist
only to build the hero's spec strip, and come out with it, along with any import
left unused. Lint will name them.

## Admin

`/admin/slides`, following `/admin/brands` exactly: a list with a thumbnail, the
Georgian alt, the link target, order and state, with edit and delete per row,
plus `new` and `[id]` pages sharing one form.

The image is chosen from the existing media library using the picker the product
form already uses; uploading stays at `/admin/media`. Banners are uploaded once
there and then selected here.

Deleting is unguarded, unlike a brand: nothing references a slide, so removing
one only removes it.

## API

`POST /api/admin/slides` and `PATCH|DELETE /api/admin/slides/[id]`, with the same
`assertSameOrigin` then `requireAdmin` chain and the same `@/lib/api` error
shapes as every other admin handler.

Two validation rules carry weight beyond tidiness:

- **The image URL must be on the Cloudinary delivery path already allowed in
  `next.config.ts`.** A URL from any other host throws inside `next/image` at
  render time — on the homepage, for every visitor, not on the admin page where
  the mistake was made.
- **`href` must be site-relative, starting with `/` and not `//`.** An arbitrary
  URL in that field would turn the homepage banner into an off-site link, and a
  `javascript:` value into something worse. Rejecting anything that is not a
  relative path is simpler to reason about than sanitising.

## Testing

No test runner exists in this repository; the two features before this one
shipped verified by a script plus a browser pass, and this follows that.

`scripts/verify-slides.ts`:

1. Slides come back ordered by `order`.
2. An inactive slide is absent from `getHeroSlides()`.
3. With no active slides the query returns an empty array rather than throwing.
4. A non-Cloudinary image URL is refused.
5. `href` values `https://evil.example`, `//evil.example` and
   `javascript:alert(1)` are each refused; `/c/sand-washing` is accepted.
6. An empty Georgian alt is refused.
7. `en`/`ru` alts fall back to `ka` when unset.

Browser pass:

8. With no slides, the homepage shows the current hero unchanged.
9. With slides, the carousel replaces it; the first banner is visible without
   scrolling.
10. Swipe advances on a phone; arrows and dots work with a mouse and by keyboard.
11. Autoplay advances, and stops while the pointer is over the carousel.
12. With "reduce motion" set, autoplay never starts.
13. A square banner and a wide banner both appear whole, letterboxed, with no
    text cut off.
14. A slide with an `href` navigates; one without is not a link.
15. A single active slide renders with no arrows or dots.
16. The banners look right in all three locales, and the page does not reflow as
    they load.
