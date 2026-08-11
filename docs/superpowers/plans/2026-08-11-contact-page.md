# Contact Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the site a `/contact` page pairing the primary branch's details with a message form, store what visitors send, and let the operator read and clear those messages at `/admin/messages`.

**Architecture:** A new `ContactMessage` collection — not a nullable `product` on `QuoteRequest` — written by one public route (`POST /api/contact-messages`) guarded by same-origin, a rate limit, a Zod schema and a honeypot. The storefront page is a server component that reads the branch through the same `getPrimaryLocation()` and `mapLink()` the header and `/locations` already use, so there is no second copy of the contact details. The admin side follows the list / detail / row-actions shape `/admin/locations` established.

**Tech Stack:** Next.js 16 (App Router, `PageProps`/`RouteContext` typed helpers), React 19, Mongoose 9, Zod 4, Tailwind v4, next-intl (storefront only), lucide-react, tsx for scripts.

**Spec:** `docs/superpowers/specs/2026-08-11-contact-page-design.md`

## Global Constraints

- **Read the Next.js docs first.** `AGENTS.md` requires it — this version has breaking changes versus training data. Guides are in `node_modules/next/dist/docs/`. `PageProps<"/[locale]/contact">` and `RouteContext<"/api/admin/messages/[id]">` are globals, and `params` is always a Promise. Copy shapes from `app/[locale]/locations/page.tsx` and `app/api/admin/locations/[id]/route.ts`.
- **The admin tree is unlocalised, English-only.** No `next-intl` imports in `/admin` pages or components. The storefront IS localised: `getTranslations` in server components, `useTranslations` in client ones, and the localised `Link` from `@/i18n/navigation` for internal links.
- **Every admin API handler runs `assertSameOrigin(request)` then `requireAdmin()`, in that order, before anything else** — both from `@/lib/auth/guard`.
- **The public route runs `assertSameOrigin(request)` first, then `rateLimit`, then the schema, then the honeypot.** It never reads the session: a message is not part of an account's history the way a quote is.
- **Error shapes come from `@/lib/api`:** `validationError({field: code})`, `notFoundJson("message")`, `apiError(error)` in every catch. Never invent a new response shape.
- **Rate limit: `5` per hour per IP**, via `rateLimit(\`contact:${clientIp(request)}\`, 5, 60 * 60 * 1000)`, answering `429` with a `Retry-After` header. Five, not the quote route's twenty.
- **Honeypot field name is `website`.** Read from the raw body, never declared in the schema (Zod strips undeclared keys). Non-empty → return `201` with a fabricated id and store nothing.
- **Two statuses only: `"new"` and `"handled"`.** Not the quote request's three.
- **Field codes are exactly `required`, `email` and `too_long`.** The form renders a message per code.
- **`nav.contact` already exists in all three locale files** — reuse it for every navigation link. Do not add a second key for the same word.
- **Every new storefront string needs ka, en and ru.** Georgian is the fallback locale, so a missing `ka` renders blank rather than English.
- **No test runner exists in this repo and adding one is forbidden.** Verification is `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run verify:contact` (created in Task 1), and a browser pass.
- **DB scripts need the DNS shim in this environment**, outside the repo and never worked around in a repo file: `npx tsx --require <scratchpad>/dns-fix.cjs scripts/verify-contact.ts`. The controller supplies the path.
- **Commit after every task.** Conventional Commits, English prose.

---

## File Structure

**Create:**
- `lib/models/contact-message.ts` — the model.
- `app/api/contact-messages/route.ts` — the public POST.
- `app/api/admin/messages/[id]/route.ts` — PATCH (status) and DELETE.
- `app/[locale]/contact/page.tsx` — the public page.
- `components/contact/contact-details.tsx` — the left-hand card. Separate from the page because it is the one piece that reads a branch, and the page is otherwise layout.
- `components/contact/contact-form.tsx` — the client form.
- `app/admin/messages/page.tsx` — the list.
- `app/admin/messages/[id]/page.tsx` — one message.
- `components/admin/message-actions.tsx` — mark handled / reopen / delete.
- `scripts/verify-contact.ts`.

**Modify:**
- `lib/auth/schemas.ts` — `contactMessageSchema`.
- `lib/queries/admin.ts` — `AdminMessageRow`, `listAdminMessages`, `getAdminMessage`, and two new counts.
- `app/admin/layout.tsx` — nav entry.
- `app/admin/page.tsx` — dashboard tile.
- `messages/ka.json`, `messages/en.json`, `messages/ru.json` — the `contact` namespace.
- `components/layout/site-footer.tsx`, `components/layout/site-header.tsx`, `components/layout/mobile-nav.tsx`, `app/[locale]/locations/page.tsx` — the four links.
- `package.json` — `verify:contact`.

---

### Task 1: The model, the schema and the verification harness

**Files:**
- Create: `lib/models/contact-message.ts`, `scripts/verify-contact.ts`
- Modify: `lib/auth/schemas.ts`, `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ContactMessage` model and `ContactMessageDocument` from `lib/models/contact-message.ts`, with fields `name`, `email`, `phone?`, `subject`, `message`, `locale`, `status`, and `createdAt`/`updatedAt` from `timestamps`.
  - `CONTACT_STATUSES = ["new", "handled"] as const` from the same file.
  - `contactMessageSchema` in `lib/auth/schemas.ts`, parsing to `{ name: string; email: string; phone?: string; subject: string; message: string }`.
  - `npm run verify:contact`.

- [ ] **Step 1: Write the failing checks**

Create `scripts/verify-contact.ts`:

```ts
/**
 * DB-level and schema checks for contact messages.
 *
 * Run with `npm run verify:contact`. Every fixture carries the marker below in
 * `subject` and is removed in the `finally`, including when an assertion throws.
 * It writes to whatever MONGODB_URI points at, exactly like the seed script.
 */
import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";

import { ContactMessage } from "../lib/models/contact-message";

loadEnvConfig(process.cwd());

const MARKER = "zzz-verify-contact";
let passed = 0;

function check(label: string, condition: boolean) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  passed += 1;
  console.log(`  ok  ${label}`);
}

async function cleanup() {
  await ContactMessage.deleteMany({ subject: { $regex: MARKER } });
}

/** A complete, valid submission; each check overrides only what it is testing. */
function submission(overrides: Record<string, unknown> = {}) {
  return {
    name: "Nino Beridze",
    email: "nino@example.com",
    phone: "+995 599 11 22 33",
    subject: `${MARKER} question about a tunnel`,
    message: "Do you service the machine you install?",
    ...overrides,
  };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);

  try {
    await cleanup();

    const { contactMessageSchema, fieldErrors } = await import("../lib/auth/schemas");

    check("the schema accepts a complete message", contactMessageSchema.safeParse(submission()).success);
    check(
      "the schema accepts a message with no phone — the only optional field",
      contactMessageSchema.safeParse(submission({ phone: "" })).success,
    );

    const codeFor = (overrides: Record<string, unknown>, field: string) => {
      const result = contactMessageSchema.safeParse(submission(overrides));
      return result.success ? undefined : fieldErrors(result.error)[field];
    };

    check("a blank name is refused as required", codeFor({ name: "" }, "name") === "required");
    check("a blank subject is refused as required", codeFor({ subject: "" }, "subject") === "required");
    check("a blank message is refused as required", codeFor({ message: "" }, "message") === "required");
    check("a malformed email is refused", codeFor({ email: "not-an-email" }, "email") === "email");
    check(
      "a 5000-character message is refused as too long",
      codeFor({ message: "x".repeat(5000) }, "message") === "too_long",
    );

    // Stored messages start unread: the admin list's whole job is showing what
    // has not been dealt with yet.
    const created = await ContactMessage.create({ ...submission(), locale: "ka" });
    check("a stored message starts as new", created.status === "new");

    const { listAdminMessages, getAdminMessage } = await import("../lib/queries/admin");

    const rows = (await listAdminMessages()).filter((row) => row.subject.includes(MARKER));
    check("the stored message appears in the admin list", rows.length === 1);
    check("with its sender's details", rows[0]?.email === "nino@example.com");

    const one = await getAdminMessage(String(created._id));
    check("and can be read on its own", one?.message === submission().message);

    await ContactMessage.updateOne({ _id: created._id }, { $set: { status: "handled" } });
    const afterHandled = await getAdminMessage(String(created._id));
    check("marking it handled changes its status", afterHandled?.status === "handled");

    const { rateLimit } = await import("../lib/auth/rate-limit");
    const key = `contact:${MARKER}`;
    const verdicts = Array.from({ length: 6 }, () => rateLimit(key, 5, 60 * 60 * 1000).ok);
    check("five messages an hour are allowed", verdicts.slice(0, 5).every(Boolean));
    check("and the sixth is refused", verdicts[5] === false);
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

Add the script to `package.json`, after `verify:locations`:

```json
    "verify:contact": "tsx scripts/verify-contact.ts"
```

- [ ] **Step 2: Run the checks to verify they fail**

Run: `npm run verify:contact`
Expected: FAIL — `lib/models/contact-message.ts` does not exist, so the import at the top throws `Cannot find module`.

- [ ] **Step 3: Write the model**

Create `lib/models/contact-message.ts`:

```ts
import { type InferSchemaType, type Model, Schema, model, models } from "mongoose";

import { LOCALES } from "../types";

export const CONTACT_STATUSES = ["new", "handled"] as const;

/**
 * A message from the contact page.
 *
 * Its own collection rather than a `QuoteRequest` with no product: that model
 * requires `product`, and relaxing it would leave every quote query and the
 * attachment list asking whether a row is really a quote, to save one collection.
 *
 * Two statuses, not the quote request's three: a message has either been dealt
 * with or it has not, and a middle state the operator must interpret earns
 * nothing. `locale` is stored so a reply goes out in the language the sender
 * wrote in.
 */
const contactMessageSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true, maxlength: 4000 },
    locale: { type: String, enum: LOCALES, required: true },
    status: { type: String, enum: CONTACT_STATUSES, default: "new" },
  },
  { timestamps: true },
);

/** The admin list's only query: unread first is a sort in the page, not here. */
contactMessageSchema.index({ status: 1, createdAt: -1 });

export type ContactMessageDocument = InferSchemaType<typeof contactMessageSchema>;

/**
 * `models.ContactMessage ??` is not optional: dev hot reload re-runs this module
 * against a connection that already has the model compiled, and a second
 * `model()` call throws OverwriteModelError.
 *
 * Same dev caveat as the other models: because the compiled model is cached,
 * **editing this schema needs a dev-server restart**. Hot reload keeps the old
 * schema and Mongoose then strips any newly added field on write, with no error.
 */
export const ContactMessage: Model<ContactMessageDocument> =
  (models.ContactMessage as Model<ContactMessageDocument>) ??
  model<ContactMessageDocument>("ContactMessage", contactMessageSchema);
```

- [ ] **Step 4: Write the schema**

In `lib/auth/schemas.ts`, add after `quoteRequestSchema` (around line 74):

```ts
/**
 * The contact form. Only `phone` is optional — a reply needs a name, an address
 * to send to, and something to reply about.
 *
 * The codes are the three the form renders: `required`, `email`, `too_long`. The
 * honeypot is deliberately absent — it is read from the raw body in the route,
 * because Zod strips keys the schema does not declare.
 */
export const contactMessageSchema = z.object({
  name: z.string().trim().min(2, "required").max(120, "too_long"),
  email: z.string().trim().toLowerCase().min(3, "required").max(254, "too_long").email("email"),
  phone: z.string().trim().max(40, "too_long").optional().or(z.literal("")),
  subject: z.string().trim().min(2, "required").max(160, "too_long"),
  message: z.string().trim().min(2, "required").max(4000, "too_long"),
});
```

- [ ] **Step 5: Add the admin queries the checks call**

In `lib/queries/admin.ts`, import the model beside the others (the import block at the top, alphabetically after `Category`):

```ts
import { ContactMessage } from "../models/contact-message";
```

Then add at the end of the file:

```ts
export type AdminMessageRow = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  locale: string;
  status: "new" | "handled";
  createdAt: string;
};

/**
 * Every message, unread first and newest first within each group.
 *
 * Ordered that way rather than purely by date because the reason to open this
 * screen is to see what has not been answered; a handled message from this
 * morning is not more urgent than an unread one from yesterday.
 *
 * The grouping is applied here rather than in the query because Mongo can only
 * sort the status alphabetically, which puts "handled" before "new" — the exact
 * opposite of what this screen is for. `Array.prototype.sort` is stable, so the
 * `createdAt` order the query established survives inside each group.
 */
export async function listAdminMessages(): Promise<AdminMessageRow[]> {
  await connectToDatabase();
  const docs = await ContactMessage.find({}).sort({ createdAt: -1 }).limit(200).lean();

  const rows: AdminMessageRow[] = docs.map((doc) => ({
    id: String(doc._id),
    name: doc.name,
    email: doc.email,
    phone: doc.phone?.trim() || undefined,
    subject: doc.subject,
    message: doc.message,
    locale: doc.locale,
    status: (doc.status ?? "new") as AdminMessageRow["status"],
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : "",
  }));

  return rows.sort((a, b) => Number(a.status === "handled") - Number(b.status === "handled"));
}

export async function getAdminMessage(id: string): Promise<AdminMessageRow | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  await connectToDatabase();

  const doc = await ContactMessage.findById(id).lean();
  if (!doc) return null;

  return {
    id: String(doc._id),
    name: doc.name,
    email: doc.email,
    phone: doc.phone?.trim() || undefined,
    subject: doc.subject,
    message: doc.message,
    locale: doc.locale,
    status: (doc.status ?? "new") as AdminMessageRow["status"],
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : "",
  };
}
```

- [ ] **Step 6: Add the dashboard counts**

In `lib/queries/admin.ts`, add two fields to the `AdminCounts` type, after `newQuotes`:

```ts
  messages: number;
  newMessages: number;
```

In `getAdminCounts`, extend the destructuring and the `Promise.all` array with two more counts, and return them:

```ts
  const [users, admins, quotes, newQuotes, messages, newMessages, media, products, mediaSize, attachmentCount] =
    await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ role: "admin" }),
      QuoteRequest.countDocuments({}),
      QuoteRequest.countDocuments({ status: "new" }),
      ContactMessage.countDocuments({}),
      ContactMessage.countDocuments({ status: "new" }),
      MediaAsset.countDocuments({}),
      Product.countDocuments({ isActive: true }),
      // …the two aggregations, unchanged…
```

and in the returned object, after `newQuotes`:

```ts
    messages,
    newMessages,
```

Keep every existing entry exactly as it is — the order of the destructured names must match the order of the promises.

- [ ] **Step 7: Run the checks to verify they pass**

Run: `npx tsc --noEmit`
Expected: no output.

Run: `npm run verify:contact`
Expected: every check prints `ok`, ending in `14 checks passed`.

- [ ] **Step 8: Commit**

```bash
git add lib/models/contact-message.ts lib/auth/schemas.ts lib/queries/admin.ts scripts/verify-contact.ts package.json
git commit -m "feat: store contact messages, with schema and verification"
```

---

### Task 2: The public endpoint

**Files:**
- Create: `app/api/contact-messages/route.ts`

**Interfaces:**
- Consumes: `contactMessageSchema` and `fieldErrors` from `lib/auth/schemas.ts`; the `ContactMessage` model (Task 1).
- Produces: `POST /api/contact-messages`, accepting JSON `{ name, email, phone?, subject, message, locale, website? }` and answering `201 { id }`, `422 { error: "validation_failed", fields }`, or `429 { error: "rate_limited" }` with `Retry-After`. Task 3's form posts to it.

- [ ] **Step 1: Write the route**

Create `app/api/contact-messages/route.ts`:

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, validationError } from "@/lib/api";
import { assertSameOrigin } from "@/lib/auth/guard";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import { contactMessageSchema, fieldErrors } from "@/lib/auth/schemas";
import { connectToDatabase } from "@/lib/db";
import { ContactMessage } from "@/lib/models/contact-message";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/types";

/**
 * Five an hour per IP, where the quote route allows twenty.
 *
 * Someone shortlisting three machines legitimately sends three quote requests;
 * nobody sends five unrelated enquiries in an hour. Both are per IP, and an
 * office behind NAT shares one — which is the reason neither number is 1.
 */
const MAX_PER_IP = 5;
const WINDOW_MS = 60 * 60 * 1000;

/**
 * A message from the contact page.
 *
 * Open to signed-out visitors, like the quote route: requiring an account before
 * someone can ask a question costs enquiries. Unlike the quote route it does not
 * read the session at all — a message is not part of an account's history, and
 * attaching a user would imply it is.
 */
export async function POST(request: NextRequest) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const limited = rateLimit(`contact:${clientIp(request)}`, MAX_PER_IP, WINDOW_MS);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
    );
  }

  try {
    const payload = (await request.json()) as Record<string, unknown>;

    const parsed = contactMessageSchema.safeParse(payload);
    if (!parsed.success) return validationError(fieldErrors(parsed.error));

    // The honeypot: a field hidden from sight and from screen readers, which a
    // bot fills in and a person cannot. Read from the raw body because Zod
    // strips keys the schema does not declare, so it never reaches parsed.data.
    //
    // The answer is an ordinary 201 with a fabricated id. Telling a bot it was
    // detected only tells whoever wrote it what to change next.
    const honeypot = typeof payload.website === "string" ? payload.website.trim() : "";
    if (honeypot) {
      return NextResponse.json({ id: "accepted" }, { status: 201 });
    }

    const localeRaw = typeof payload.locale === "string" ? payload.locale : "";
    const locale: Locale = LOCALES.includes(localeRaw as Locale)
      ? (localeRaw as Locale)
      : DEFAULT_LOCALE;

    await connectToDatabase();

    const created = await ContactMessage.create({
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone || undefined,
      subject: parsed.data.subject,
      message: parsed.data.message,
      locale,
      status: "new",
    });

    return NextResponse.json({ id: String(created._id) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
```

- [ ] **Step 2: Verify it compiles and lints**

Run: `npx tsc --noEmit`
Expected: no output.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Exercise it against a running server**

Start the dev server (`npm run dev`), then run each of these and confirm the stated response. `curl` is available through the Bash tool; the `Origin` header is required because `assertSameOrigin` rejects a cross-origin write.

A valid message → `201` with an id:

```bash
curl -s -o - -w "\n%{http_code}\n" -X POST http://localhost:3000/api/contact-messages \
  -H "Content-Type: application/json" -H "Origin: http://localhost:3000" \
  -d '{"name":"Nino Beridze","email":"nino@example.com","phone":"","subject":"zzz-curl-check tunnel question","message":"Do you service what you install?","locale":"ka"}'
```

A blank subject → `422` with `fields.subject === "required"`:

```bash
curl -s -o - -w "\n%{http_code}\n" -X POST http://localhost:3000/api/contact-messages \
  -H "Content-Type: application/json" -H "Origin: http://localhost:3000" \
  -d '{"name":"Nino Beridze","email":"nino@example.com","subject":"","message":"Hello there","locale":"ka"}'
```

A filled honeypot → `201`, and **nothing new stored**:

```bash
curl -s -o - -w "\n%{http_code}\n" -X POST http://localhost:3000/api/contact-messages \
  -H "Content-Type: application/json" -H "Origin: http://localhost:3000" \
  -d '{"name":"Bot","email":"bot@example.com","subject":"zzz-curl-check bot","message":"buy pills","locale":"ka","website":"http://spam.example"}'
```

Confirm the honeypot stored nothing by counting the marker rows — expect exactly `1`, the valid message from the first call:

```bash
npx tsx --require <scratchpad>/dns-fix.cjs -e "
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  (async () => {
    const mongoose = require('mongoose');
    await mongoose.connect(process.env.MONGODB_URI);
    const { ContactMessage } = await import('./lib/models/contact-message.ts');
    console.log('marker rows:', await ContactMessage.countDocuments({ subject: /zzz-curl-check/ }));
    await ContactMessage.deleteMany({ subject: /zzz-curl-check/ });
    console.log('cleaned up');
    await mongoose.disconnect();
  })();
"
```

The cleanup in that snippet is not optional — leave no `zzz-curl-check` rows behind. Then stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add app/api/contact-messages/route.ts
git commit -m "feat: accept contact messages, rate-limited and honeypotted"
```

---

### Task 3: The contact page

**Files:**
- Create: `app/[locale]/contact/page.tsx`, `components/contact/contact-details.tsx`, `components/contact/contact-form.tsx`
- Modify: `messages/ka.json`, `messages/en.json`, `messages/ru.json`

**Interfaces:**
- Consumes: `POST /api/contact-messages` (Task 2) and its field codes `required`, `email`, `too_long`; `getPrimaryLocation()` from `lib/queries/locations.ts`; `mapLink(address, mapUrl?)` from `lib/locations/map-link.ts`; `pickLocale` from `lib/localized.ts`.
- Produces: the `/[locale]/contact` route, which Task 4's navigation links point at, and the `contact` message namespace.

- [ ] **Step 1: Add the strings**

In each of `messages/en.json`, `messages/ka.json` and `messages/ru.json`, add a `contact` namespace immediately after the `locations` namespace. English:

```json
  "contact": {
    "title": "Contact us",
    "intro": "Call, write, or send the form below and we will come back to you within one working day.",
    "detailsTitle": "Contact details",
    "formTitle": "Send us a message",
    "name": "Full name",
    "email": "Email",
    "phone": "Phone",
    "subject": "Subject",
    "message": "Message",
    "messagePlaceholder": "What do you need? Include the model or the site if it helps.",
    "optional": "optional",
    "submit": "Send message",
    "sending": "Sending…",
    "successTitle": "Message sent",
    "successText": "Thank you. We will reply to the address you gave us.",
    "errorGeneric": "That did not send. Please try again.",
    "errorRateLimited": "Too many messages from this connection. Try again later.",
    "errorFields": "Some fields need attention.",
    "errorRequired": "This field is required.",
    "errorEmail": "Enter a valid email address.",
    "errorTooLong": "That is longer than we can accept.",
    "allLocations": "All locations"
  },
```

Georgian:

```json
  "contact": {
    "title": "კონტაქტი",
    "intro": "დაგვირეკეთ, მოგვწერეთ ან შეავსეთ ფორმა — გიპასუხებთ ერთი სამუშაო დღის განმავლობაში.",
    "detailsTitle": "საკონტაქტო ინფორმაცია",
    "formTitle": "მოგვწერეთ",
    "name": "სახელი და გვარი",
    "email": "ელფოსტა",
    "phone": "ტელეფონი",
    "subject": "თემა",
    "message": "შეტყობინება",
    "messagePlaceholder": "რა გჭირდებათ? მიუთითეთ მოდელი ან ობიექტი, თუ დაგვეხმარება.",
    "optional": "არასავალდებულო",
    "submit": "გაგზავნა",
    "sending": "იგზავნება…",
    "successTitle": "შეტყობინება გაიგზავნა",
    "successText": "გმადლობთ. პასუხს მითითებულ ელფოსტაზე მიიღებთ.",
    "errorGeneric": "ვერ გაიგზავნა. სცადეთ ხელახლა.",
    "errorRateLimited": "ამ კავშირიდან ძალიან ბევრი შეტყობინებაა. სცადეთ მოგვიანებით.",
    "errorFields": "ზოგიერთი ველი შესასწორებელია.",
    "errorRequired": "ველი სავალდებულოა.",
    "errorEmail": "შეიყვანეთ სწორი ელფოსტა.",
    "errorTooLong": "ტექსტი დასაშვებზე გრძელია.",
    "allLocations": "ყველა ფილიალი"
  },
```

Russian:

```json
  "contact": {
    "title": "Связаться с нами",
    "intro": "Позвоните, напишите или заполните форму — ответим в течение одного рабочего дня.",
    "detailsTitle": "Контактная информация",
    "formTitle": "Напишите нам",
    "name": "Имя и фамилия",
    "email": "Эл. почта",
    "phone": "Телефон",
    "subject": "Тема",
    "message": "Сообщение",
    "messagePlaceholder": "Что вам нужно? Укажите модель или объект, если это поможет.",
    "optional": "необязательно",
    "submit": "Отправить",
    "sending": "Отправка…",
    "successTitle": "Сообщение отправлено",
    "successText": "Спасибо. Мы ответим на указанный адрес.",
    "errorGeneric": "Не отправилось. Попробуйте снова.",
    "errorRateLimited": "Слишком много сообщений с этого соединения. Попробуйте позже.",
    "errorFields": "Некоторые поля нужно исправить.",
    "errorRequired": "Обязательное поле.",
    "errorEmail": "Введите корректный адрес эл. почты.",
    "errorTooLong": "Текст длиннее допустимого.",
    "allLocations": "Все филиалы"
  },
```

- [ ] **Step 2: Write the details card**

Create `components/contact/contact-details.tsx`:

```tsx
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { mapLink } from "@/lib/locations/map-link";
import { pickLocale } from "@/lib/localized";
import type { Locale, StoreLocation } from "@/lib/types";

/**
 * The primary branch's details, beside the form.
 *
 * It takes the branch as a prop rather than reading it: the page already needs
 * `getPrimaryLocation()` for its metadata, and two reads of the same cached
 * query in one render is a fact worth not relying on.
 */
export async function ContactDetails({
  location,
  locale,
}: {
  location: StoreLocation;
  locale: Locale;
}) {
  const t = await getTranslations("contact");
  const address = pickLocale(location.address, locale);
  const mapHref = mapLink(address, location.mapUrl);

  return (
    <div className="bg-card flex flex-col gap-3 rounded-xl border p-5">
      <h2 className="text-display text-lg">{pickLocale(location.name, locale)}</h2>

      <a
        href={`tel:${location.phone.replace(/\s/g, "")}`}
        className="text-data hover:text-primary inline-flex items-center gap-2 text-sm font-semibold transition-colors"
      >
        <Phone aria-hidden className="size-4 shrink-0" />
        {location.phone}
      </a>

      {location.phone2 ? (
        <a
          href={`tel:${location.phone2.replace(/\s/g, "")}`}
          className="text-data hover:text-primary inline-flex items-center gap-2 text-sm font-semibold transition-colors"
        >
          <Phone aria-hidden className="size-4 shrink-0" />
          {location.phone2}
        </a>
      ) : null}

      {location.email ? (
        <a
          href={`mailto:${location.email}`}
          className="hover:text-primary inline-flex items-center gap-2 text-sm transition-colors"
        >
          <Mail aria-hidden className="size-4 shrink-0" />
          {location.email}
        </a>
      ) : null}

      {mapHref ? (
        <a
          href={mapHref}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-primary inline-flex items-start gap-2 text-sm transition-colors"
        >
          <MapPin aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          {address}
        </a>
      ) : (
        <p className="inline-flex items-start gap-2 text-sm">
          <MapPin aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          {address}
        </p>
      )}

      <p className="text-muted-foreground inline-flex items-start gap-2 text-sm">
        <Clock aria-hidden className="mt-0.5 size-4 shrink-0" />
        {pickLocale(location.workHours, locale)}
      </p>

      <Link
        href="/locations"
        className="hover:text-primary mt-1 text-sm font-semibold transition-colors"
      >
        {t("allLocations")} →
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Write the form**

Create `components/contact/contact-form.tsx`:

```tsx
"use client";

import { CheckCircle2, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The contact form.
 *
 * On success the form is replaced by a confirmation rather than cleared and
 * shown again: a cleared form invites a second submission of the same message.
 * A failure leaves every field as typed — losing someone's paragraph because
 * their email had a typo is the worst thing a form can do.
 *
 * `noValidate` hands validation to the route rather than the browser, so the
 * messages are ours, translated, and consistent with what the server enforces.
 */
export function ContactForm({ locale }: { locale: string }) {
  const t = useTranslations("contact");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const messageFor = (code: string) => {
    switch (code) {
      case "required":
        return t("errorRequired");
      case "email":
        return t("errorEmail");
      case "too_long":
        return t("errorTooLong");
      default:
        return t("errorGeneric");
    }
  };

  const fieldError = (key: string) => (fields[key] ? messageFor(fields[key]) : null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});

    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      subject: String(form.get("subject") ?? ""),
      message: String(form.get("message") ?? ""),
      website: String(form.get("website") ?? ""),
      locale,
    };

    try {
      const response = await fetch("/api/contact-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setDone(true);
        return;
      }

      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        fields?: Record<string, string>;
      };
      if (body.fields) {
        setFields(body.fields);
        setError(t("errorFields"));
      } else if (body.error === "rate_limited") {
        setError(t("errorRateLimited"));
      } else {
        setError(t("errorGeneric"));
      }
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="bg-card flex flex-col items-center gap-3 rounded-xl border p-8 text-center">
        <CheckCircle2 aria-hidden className="size-10 text-green-600" />
        <h2 className="text-display text-lg">{t("successTitle")}</h2>
        <p className="text-muted-foreground text-sm">{t("successText")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="bg-card flex flex-col gap-4 rounded-xl border p-5" noValidate>
      <h2 className="text-display text-lg">{t("formTitle")}</h2>

      {error ? (
        <p
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="c-name">{t("name")}</Label>
        <Input id="c-name" name="name" aria-invalid={Boolean(fieldError("name"))} required />
        {fieldError("name") ? <p className="text-destructive text-xs">{fieldError("name")}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="c-email">{t("email")}</Label>
        <Input
          id="c-email"
          name="email"
          type="email"
          aria-invalid={Boolean(fieldError("email"))}
          required
        />
        {fieldError("email") ? (
          <p className="text-destructive text-xs">{fieldError("email")}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="c-phone">
          {t("phone")}{" "}
          <span className="text-muted-foreground font-normal">({t("optional")})</span>
        </Label>
        <Input id="c-phone" name="phone" className="text-data" aria-invalid={Boolean(fieldError("phone"))} />
        {fieldError("phone") ? (
          <p className="text-destructive text-xs">{fieldError("phone")}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="c-subject">{t("subject")}</Label>
        <Input id="c-subject" name="subject" aria-invalid={Boolean(fieldError("subject"))} required />
        {fieldError("subject") ? (
          <p className="text-destructive text-xs">{fieldError("subject")}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="c-message">{t("message")}</Label>
        <textarea
          id="c-message"
          name="message"
          rows={6}
          placeholder={t("messagePlaceholder")}
          aria-invalid={Boolean(fieldError("message"))}
          required
          className="border-input bg-background focus-visible:ring-ring aria-invalid:border-destructive w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
        />
        {fieldError("message") ? (
          <p className="text-destructive text-xs">{fieldError("message")}</p>
        ) : null}
      </div>

      {/*
        The honeypot. Hidden from sight AND from screen readers, and marked
        autocomplete="off" so a browser never helpfully fills it in — a real
        person must never be able to trip this. The route treats a non-empty
        value as a bot.
      */}
      <div aria-hidden className="hidden">
        <label htmlFor="c-website">Website</label>
        <input id="c-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <Button
          type="submit"
          disabled={pending}
          className="bg-brand-yellow hover:bg-brand-yellow-dark h-11 text-sm font-bold text-black"
        >
          <Send aria-hidden className="size-4" />
          {pending ? t("sending") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Write the page**

Create `app/[locale]/contact/page.tsx`:

```tsx
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { ContactDetails } from "@/components/contact/contact-details";
import { ContactForm } from "@/components/contact/contact-form";
import { getPrimaryLocation } from "@/lib/queries/locations";
import type { Locale } from "@/lib/types";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/contact">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "contact" });
  return { title: t("title"), description: t("intro") };
}

export default async function ContactPage({ params }: PageProps<"/[locale]/contact">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("contact");
  const typedLocale = locale as Locale;
  const location = await getPrimaryLocation();

  return (
    <div className="container-page py-12">
      <h1 className="text-display text-xl sm:text-2xl">{t("title")}</h1>
      <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">{t("intro")}</p>

      {/* Details first in the markup as well as on screen: someone who only
          wants the phone number should not tab through the whole form. */}
      <div className="mt-8 grid items-start gap-6 md:grid-cols-2">
        <ContactDetails location={location} locale={typedLocale} />
        <ContactForm locale={locale} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify it compiles, lints and builds**

Run: `npx tsc --noEmit`
Expected: no output.

Run: `npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds, and the route list includes `/[locale]/contact`.

- [ ] **Step 6: Check the rendered page**

Start the dev server, then fetch each locale and confirm HTTP 200 plus the expected content:

```bash
for path in /ka/contact /en/contact /ru/contact; do
  echo "== $path"
  curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000$path"
  curl -s "http://localhost:3000$path" | grep -c 'name="website"'
  curl -s "http://localhost:3000$path" | grep -o 'href="tel:[^"]*"' | head -2
done
```

Expected per locale: `200`, exactly `1` honeypot field, and the primary branch's `tel:` links. Then stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add "app/[locale]/contact/page.tsx" components/contact messages/ka.json messages/en.json messages/ru.json
git commit -m "feat: add a contact page with a message form"
```

---

### Task 4: Reading messages in the panel, and the four links

**Files:**
- Create: `app/admin/messages/page.tsx`, `app/admin/messages/[id]/page.tsx`, `components/admin/message-actions.tsx`, `app/api/admin/messages/[id]/route.ts`
- Modify: `app/admin/layout.tsx:34-45`, `app/admin/page.tsx:10-46`, `components/layout/site-footer.tsx:52-62`, `components/layout/site-header.tsx:58-76`, `components/layout/mobile-nav.tsx`, `app/[locale]/locations/page.tsx`

**Interfaces:**
- Consumes: `listAdminMessages()`, `getAdminMessage(id)`, `AdminMessageRow`, and the `messages`/`newMessages` counts (Task 1); the `/[locale]/contact` route (Task 3); the existing `nav.contact` translation key.
- Produces: nothing — this is the last task.

- [ ] **Step 1: Write the admin API route**

Create `app/api/admin/messages/[id]/route.ts`:

```ts
import { Types } from "mongoose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, notFoundJson, validationError } from "@/lib/api";
import { assertSameOrigin, requireAdmin } from "@/lib/auth/guard";
import { connectToDatabase } from "@/lib/db";
import { CONTACT_STATUSES, ContactMessage } from "@/lib/models/contact-message";

/** Marks a message handled, or puts it back in the unread pile. */
export async function PATCH(request: NextRequest, context: RouteContext<"/api/admin/messages/[id]">) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) return notFoundJson("message");

    const body = (await request.json().catch(() => ({}))) as { status?: unknown };
    const status = typeof body.status === "string" ? body.status : "";
    // Validated against the enum rather than trusted: this is the only field the
    // handler writes, so an unchecked value would be the whole attack surface.
    if (!CONTACT_STATUSES.includes(status as (typeof CONTACT_STATUSES)[number])) {
      return validationError({ status: "invalid" });
    }

    await connectToDatabase();
    const updated = await ContactMessage.findByIdAndUpdate(id, { $set: { status } }, { new: true })
      .select("_id status")
      .lean();
    if (!updated) return notFoundJson("message");

    return NextResponse.json({ id: String(updated._id), status: updated.status });
  } catch (error) {
    return apiError(error);
  }
}

/**
 * Deletes a message.
 *
 * No guard against deleting the last one, unlike locations: an empty inbox is a
 * perfectly good state, and spam is exactly what this button is for.
 */
export async function DELETE(request: NextRequest, context: RouteContext<"/api/admin/messages/[id]">) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) return notFoundJson("message");

    await connectToDatabase();
    const message = await ContactMessage.findById(id).select("_id");
    if (!message) return notFoundJson("message");

    await message.deleteOne();
    return NextResponse.json({ deleted: id });
  } catch (error) {
    return apiError(error);
  }
}
```

- [ ] **Step 2: Write the row actions component**

Create `components/admin/message-actions.tsx`:

```tsx
"use client";

import { MailOpen, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Mark handled, reopen, delete.
 *
 * Deleting asks first and says it cannot be undone: a message is someone's words
 * and there is no second copy anywhere.
 */
export function MessageActions({
  id,
  status,
  subject,
}: {
  id: string;
  status: "new" | "handled";
  subject: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(next: "new" | "handled") {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (response.ok) {
        router.refresh();
        return;
      }
      setError("Could not update that message.");
    } catch {
      setError("Could not update that message.");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${subject}"?\n\nThis cannot be undone.`)) return;

    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/messages/${id}`, { method: "DELETE" });
      if (response.ok) {
        router.push("/admin/messages");
        router.refresh();
        return;
      }
      setError("Could not delete that message.");
    } catch {
      setError("Could not delete that message.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-1.5">
        {status === "new" ? (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => setStatus("handled")}>
            <MailOpen aria-hidden className="size-3.5" />
            Mark handled
          </Button>
        ) : (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setStatus("new")}>
            <RotateCcw aria-hidden className="size-3.5" />
            Reopen
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={remove}
          className="text-destructive hover:bg-destructive/10"
        >
          <Trash2 aria-hidden className="size-3.5" />
          {pending ? "Working…" : "Delete"}
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

Create `app/admin/messages/page.tsx`:

```tsx
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { listAdminMessages } from "@/lib/queries/admin";

export default async function AdminMessagesPage() {
  const messages = await listAdminMessages();
  const unread = messages.filter((message) => message.status === "new").length;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-display text-2xl">Messages</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {unread} unread, {messages.length} in total. Sent from the contact page; unread first.
        </p>
      </header>

      {messages.length === 0 ? (
        <p className="bg-card text-muted-foreground rounded-lg border p-6 text-sm">
          No messages yet. They arrive here when a visitor uses the contact form.
        </p>
      ) : (
        <div className="bg-card overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-semibold">Received</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold">From</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold">Subject</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold">State</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((message) => (
                <tr key={message.id} className="border-t">
                  <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                    {message.createdAt.slice(0, 10)}
                  </td>
                  <td className="px-3 py-2">
                    <div className={message.status === "new" ? "font-semibold" : undefined}>
                      {message.name}
                    </div>
                    <div className="text-muted-foreground text-xs">{message.email}</div>
                  </td>
                  <td className="max-w-96 px-3 py-2">
                    <Link
                      href={`/admin/messages/${message.id}`}
                      className={`hover:underline ${message.status === "new" ? "font-semibold" : ""}`}
                    >
                      {message.subject}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {message.status === "new" ? (
                      <Badge>unread</Badge>
                    ) : (
                      <Badge variant="outline">handled</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write the detail page**

Create `app/admin/messages/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";

import { MessageActions } from "@/components/admin/message-actions";
import { Badge } from "@/components/ui/badge";
import { getAdminMessage } from "@/lib/queries/admin";

export default async function AdminMessagePage({ params }: PageProps<"/admin/messages/[id]">) {
  const { id } = await params;
  const message = await getAdminMessage(id);
  if (!message) notFound();

  // Re: in the subject and the original text quoted below it, so replying is one
  // click and the operator's mail client carries their own signature.
  const replyHref = `mailto:${message.email}?subject=${encodeURIComponent(`Re: ${message.subject}`)}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/messages" className="text-muted-foreground text-sm hover:underline">
          ← Messages
        </Link>
        <h1 className="text-display mt-2 text-2xl">{message.subject}</h1>
      </div>

      <div className="bg-card flex flex-col gap-4 rounded-lg border p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">{message.name}</span>
            <a href={replyHref} className="text-primary hover:underline">
              {message.email}
            </a>
            {message.phone ? <span className="text-data">{message.phone}</span> : null}
            <span className="text-muted-foreground text-xs">
              {message.createdAt.slice(0, 16).replace("T", " ")} · wrote in{" "}
              {message.locale.toUpperCase()}
            </span>
          </div>
          <div className="flex flex-col items-end gap-2">
            {message.status === "new" ? (
              <Badge>unread</Badge>
            ) : (
              <Badge variant="outline">handled</Badge>
            )}
            <MessageActions id={message.id} status={message.status} subject={message.subject} />
          </div>
        </div>

        {/* whitespace-pre-line: the sender's line breaks are part of what they
            wrote, and collapsing them turns a list into a paragraph. */}
        <p className="border-t pt-4 text-sm leading-relaxed whitespace-pre-line">{message.message}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add the admin nav entry and dashboard tile**

In `app/admin/layout.tsx`, add `Mail` to the lucide import list (alphabetically, after `LayoutDashboard`), and add this entry to `NAV` directly after the Dashboard entry — messages are read daily, so they belong at the top rather than at the end:

```ts
  { href: "/admin/messages", label: "Messages", icon: Mail },
```

In `app/admin/page.tsx`, add `Mail` to the lucide import and insert this tile as the **first** entry of `tiles`:

```ts
    {
      label: "Messages",
      value: String(counts.messages),
      hint: `${counts.newMessages} unread`,
      href: "/admin/messages",
      icon: Mail,
    },
```

- [ ] **Step 6: Add the footer link**

In `components/layout/site-footer.tsx`, the Support column currently lists four plain `<li>` items. Add Contact as the one real link there, after the FAQ item:

```tsx
            <li>{t("footer.faq")}</li>
            <li>
              <Link href="/contact" className="hover:text-white transition-colors">
                {t("nav.contact")}
              </Link>
            </li>
```

`Link` is already imported in that file from `@/i18n/navigation`.

- [ ] **Step 7: Add the header utility-bar link**

In `components/layout/site-header.tsx`, in the utility bar's `flex items-center gap-4` group, add a Contact link directly after the existing Showroom `Link` and before the first phone anchor:

```tsx
            <Link
              href="/contact"
              className="inline-flex items-center gap-1.5 text-white/80 transition-colors hover:text-white"
            >
              <Mail aria-hidden className="size-3.5" />
              {t("nav.contact")}
            </Link>
```

Add `Mail` to the lucide import at the top of that file (the list is alphabetical: `Heart, Mail, MapPin, Phone, UserRound`).

- [ ] **Step 8: Add the mobile drawer link**

The drawer has no site-link block today: it goes straight from the category accordion to the account controls (`signedIn ? Account : Sign in / Sign up`), so Contact needs a block of its own. Insert it between the two — after the accordion's closing `</Accordion>` and before the `{/* The desktop bar's account controls… */}` comment:

```tsx
          {/* The utility bar carries this link on desktop, and that bar is
              hidden below lg — so without this the page is unreachable from a
              phone except through the footer. */}
          <div className="flex flex-col gap-1 border-t pt-4">
            <Link
              href="/contact"
              onClick={close}
              className="hover:bg-secondary flex items-center gap-2 rounded-sm px-2 py-2 text-sm font-semibold"
            >
              <Mail aria-hidden className="size-4" />
              {t("nav.contact")}
            </Link>
          </div>
```

The classes are copied from the account links directly below, so the two blocks read as one list. `close` is the existing `() => setOpen(false)` helper and `Link` is the localised one from `@/i18n/navigation`, already imported. Add `Mail` to the lucide import at the top of the file — the list is alphabetical: `ChevronRight, Mail, Menu, Phone, UserRound`.

- [ ] **Step 9: Add the locations-page link**

In `app/[locale]/locations/page.tsx`, after the closing `</ul>` of the branch grid and before the closing `</div>`, add:

```tsx
      <p className="text-muted-foreground mt-8 text-sm">
        <Link href="/contact" className="hover:text-primary font-semibold transition-colors">
          {t("nav.contact")} →
        </Link>
      </p>
```

Add the import if it is not already there: `import { Link } from "@/i18n/navigation";`.

- [ ] **Step 10: Verify everything compiles, lints, builds and still passes**

Run: `npx tsc --noEmit`
Expected: no output.

Run: `npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds; the route list includes `/[locale]/contact`, `/admin/messages` and `/admin/messages/[id]`.

Run: `npm run verify:contact`
Expected: `14 checks passed`.

- [ ] **Step 11: Browser pass**

Start the dev server. The `/admin` tree needs a signed-in admin session, so these need a real browser, not curl:

1. `/ka/contact`, `/en/contact`, `/ru/contact` each render: heading, intro, details card on the left, form on the right on a desktop width; stacked on a narrow window.
2. The details card matches the primary branch — both phone numbers when set, email when set, hours — and its address opens Google Maps.
3. Submitting a valid message shows the confirmation panel in place of the form.
4. That message appears at `/admin/messages` as unread, with the sender's name and email.
5. Opening it shows the full text with the sender's phone and the locale they wrote in; the email link opens a reply with `Re: <subject>` prefilled.
6. **Mark handled** flips the badge to handled and unbolds the row in the list; **Reopen** puts it back.
7. **Delete** asks for confirmation, then returns to the list with the message gone.
8. The dashboard's Messages tile count and unread hint follow those changes.
9. Submitting with the name box empty shows the field error under it, keeps the rest of the typed text, and stores nothing.
10. All four links reach `/contact` and stay in the current locale: footer Support column, header utility bar, mobile drawer, and the line under the `/locations` cards.
11. Delete any messages created during this pass so the panel is left as it was found.

- [ ] **Step 12: Commit**

```bash
git add app/admin/messages "app/api/admin/messages/[id]/route.ts" components/admin/message-actions.tsx app/admin/layout.tsx app/admin/page.tsx components/layout/site-footer.tsx components/layout/site-header.tsx components/layout/mobile-nav.tsx "app/[locale]/locations/page.tsx"
git commit -m "feat: read contact messages in the panel, and link the contact page"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| `ContactMessage` model, two statuses, stored `locale`, status+createdAt index | 1 (Step 3) |
| Zod schema with `required` / `email` / `too_long` | 1 (Step 4) |
| `POST /api/contact-messages`: same-origin → rate limit → schema → honeypot | 2 (Step 1) |
| 5/hour per IP with `Retry-After` | 2 (Step 1); asserted in 1 (Step 1) |
| Honeypot `website`, read from the raw body, fabricated `201` | 2 (Steps 1, 3) |
| No session read on the public route | 2 (Step 1) |
| `/contact`: two columns, primary branch left, form right | 3 (Steps 2-4) |
| Details reuse `getPrimaryLocation()` and `mapLink()` | 3 (Step 2) |
| Success replaces the form; failure keeps typed text | 3 (Step 3) |
| Admin list: received / from / subject / status, unread distinct | 4 (Step 3); sort in 1 (Step 5) |
| Detail page with `mailto:` reply, mark handled, reopen, delete | 4 (Steps 2, 4) |
| `PATCH`/`DELETE` behind same-origin + requireAdmin | 4 (Step 1) |
| Nav entry with `Mail` icon; dashboard counts | 4 (Step 5); counts in 1 (Step 6) |
| Four navigation links reusing `nav.contact` | 4 (Steps 6-9) |
| New strings in ka, en, ru | 3 (Step 1) |
| Script checks 1-6 from the spec | 1 (Step 1) |
| Browser pass 7-13 from the spec | 4 (Step 11); page render also in 3 (Step 6) |

**Two deviations from the spec, both deliberate:**
- The spec's script check list does not mention the rate limit; Task 1 asserts it anyway, because `rateLimit` is a pure in-process function and the five-an-hour decision is the kind that gets silently changed.
- The spec says the list is sorted "newest first" with unread visually distinct. Task 1 sorts unread first *and* newest within each group, which is strictly more useful and is why the sort is in JS rather than the Mongo query — `status: 1` would order `handled` before `new` alphabetically.

**Type consistency:** `AdminMessageRow` is the one row type, with `status: "new" | "handled"` matching `CONTACT_STATUSES`; `listAdminMessages()` and `getAdminMessage(id)` return it and `null` respectively, exactly as Task 4's pages consume them. The field codes `required`, `email`, `too_long` are produced in Task 1's schema and rendered in Task 3's `messageFor`. The honeypot key is `website` in Task 2's route and Task 3's input. `MessageActions` takes `{ id, status, subject }` and is called with exactly those in the detail page.
