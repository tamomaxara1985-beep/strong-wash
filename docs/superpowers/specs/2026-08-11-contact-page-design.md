# A contact page, with messages the operator reads in the panel

Date: 2026-08-11

## Problem

There is no way to write to the shop. The only form on the site is the quote
request, which is bound to a product: `QuoteRequest.product` is required
(`lib/models/quote-request.ts:42`), so a visitor with a question about servicing,
spare parts, an invoice or a job cannot use it. `/locations` gives them a phone
number and nothing else, and a `nav.contact` string sits translated in all three
locale files without being rendered anywhere.

## Scope

A `/contact` page: the primary branch's details on the left, a message form on the
right. Messages are stored and read at a new `/admin/messages`. Links to the page
from the footer, the header utility bar, the mobile drawer and `/locations`.

Out of scope, deliberately:

- **Email notification.** Messages are read in the panel. `lib/email/mailer.ts`
  exists and would work, but a notification that can fail introduces a second
  delivery path to reason about for a page that already keeps every message.
- **Live chat.** A bubble needs someone watching it in business hours, plus either
  a third-party script on the site or a websocket server to host. A form does not
  pretend anyone is standing by.
- **Attachments.** The quote form takes files because a bay photo changes the
  quote. A general enquiry does not, and every upload path is another thing to
  validate, store and clean up.
- **Replying from the panel.** The operator replies from their own mail client,
  where their signature and history already are.

## Data model

A new collection rather than a nullable `product` on `QuoteRequest`. Making that
field optional would leave every existing quote query and the admin attachment
list to ask "is this actually a quote?" on every read, to save one collection.

```ts
type ContactMessage = {
  name: string;          // required, 2-120
  email: string;         // required, lowercased
  phone?: string;        // optional, ≤40
  subject: string;       // required, 2-160
  message: string;       // required, 2-4000
  locale: Locale;        // which language they wrote in — so the reply matches
  status: "new" | "handled";
  createdAt: Date;
};
```

Two statuses, not the quote's three (`new`/`contacted`/`closed`). A message is
either dealt with or it is not; a middle state the operator has to interpret earns
nothing here.

`locale` is stored for the same reason the quote request stores it: someone who
wrote in Georgian should not get an English reply.

Indexed `{ status: 1, createdAt: -1 }`, matching `quoteRequestSchema`'s index for
the same admin-list query shape.

## The public endpoint

`POST /api/contact-messages`, open to signed-out visitors — the same call the quote
route makes, for the same reason: requiring an account before someone can ask a
question costs enquiries.

Guards, in this order:

1. `assertSameOrigin(request)` — every write route on this site starts here.
2. `rateLimit(\`contact:${clientIp(request)}\`, 5, 60 * 60 * 1000)` → `429` with
   `Retry-After`. Five an hour, not the quote route's twenty: a person shortlisting
   three machines legitimately sends three quote requests, but nobody sends five
   different enquiries in an hour. Both numbers are per IP, and an office behind
   NAT shares one.
3. Zod (`contactMessageSchema` in `lib/auth/schemas.ts`, beside the others), with
   the caps above. Failures return `validationError({field: code})`, the shape every
   form in this codebase already renders.
4. Honeypot: a `website` field, hidden from sight and from screen readers, that a
   bot fills and a person cannot. It is read from the raw request body, not through
   the schema — Zod strips unknown keys, so a field the schema does not declare
   never reaches `parsed.data`. Non-empty means a bot: the response is the ordinary
   `201` with a fabricated id and nothing stored. Telling a bot it was detected only
   tells whoever wrote it what to change.

No session is attached. A signed-in user's message is not part of their account
history the way a quote is, and reading the session here would imply it is.

## The contact page

`app/[locale]/contact/page.tsx`, a server component, localised metadata like every
other page. Two columns from `md` up, stacked below — the screenshot's layout.

**Left — the primary branch.** Name, `phone`, `phone2` when set, email when set,
address linked to the map, working hours, and an "All locations →" link. It reads
`getPrimaryLocation()` and `mapLink()`, the same two functions the header and
`/locations` use, so editing a branch in the panel updates this page too and there
is no second copy of the contact details to go stale.

**Right — the form**, `components/contact/contact-form.tsx`, a client component
posting JSON. Fields: full name, email, phone (optional), subject, message. On
success the form is replaced by a confirmation rather than cleared and re-shown,
so a second click cannot send the message twice. Field errors render under their
input from the codes the API returns; a failed request shows one message above the
form, and the typed text stays where it is.

## Admin

`/admin/messages`, following the shape `/admin/locations` and `/admin/brands`
already have:

- **List:** received, from (name over email), subject, status. Newest first. An
  unread row is visually distinct — the point of opening the screen is to see what
  is new.
- **Detail** at `/admin/messages/[id]`: the full message with the sender's details,
  a `mailto:` link that opens a reply with the subject prefilled, **Mark handled** /
  **Reopen**, and **Delete**. Delete exists because spam gets through eventually and
  a panel you cannot clean stops being read.
- Nav entry with lucide's `Mail` icon.
- `getAdminCounts` gains `messages` and `newMessages`, shown on the dashboard beside
  the quote counts it already has.

`PATCH` and `DELETE` at `/api/admin/messages/[id]`, both behind
`assertSameOrigin` + `requireAdmin`, like every other admin handler.

## Navigation

`nav.contact` is already translated in ka, en and ru, so all four entry points reuse
it:

- Footer, Support column — its four lines are currently plain text, so Contact
  becomes the first real link there.
- Header utility bar, beside the Showroom link.
- Mobile drawer, so a phone visitor is not scrolling to the footer.
- A line under the `/locations` cards, for someone who came looking for a branch and
  would rather write than call.

New strings live in a `contact` namespace: page title, intro, the form's heading,
one label per field, the send button, the sending state, the success heading and
text, and the generic failure line. All three locales.

## Testing

No test runner exists in this repository; every feature so far verified by a script
plus a browser pass, and this follows that.

`scripts/verify-contact.ts`:

1. The schema accepts a complete, valid message.
2. It accepts one with no phone — the only optional field.
3. It refuses a blank subject, a blank message, a 5000-character message and
   `not-an-email`, each with the field code the form explains.
4. A stored message round-trips through the admin query with `status: "new"`.
5. Marking it handled changes only that row's status.
6. Every fixture carries a marker in `subject` and is removed in the `finally`,
   the discipline `verify-locations.ts` established.

Browser pass:

7. `/contact` renders in all three locales, two columns on desktop and stacked on a
   phone.
8. The details card matches the primary branch, and its address opens the map.
9. A valid submission shows the confirmation and appears in `/admin/messages`.
10. A blank required field is refused with the message under that field, and the
    typed text survives the failure.
11. Filling the hidden honeypot (via dev tools) returns success and stores nothing.
12. Mark handled, reopen and delete each work, and the dashboard's unread count
    follows.
13. All four navigation links reach `/contact` in every locale.
