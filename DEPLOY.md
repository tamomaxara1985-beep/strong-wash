# Deploying to Vercel

## Why a fresh project 404s on every path

`X-Vercel-Error: NOT_FOUND` on `/`, `/ka` **and** `/api/*` is Vercel's
platform 404, not Next.js routing — it means no deployment is bound to the
hostname. The usual cause is a build that exited non-zero, so nothing was
published.

This app's build reads the database. `app/[locale]/page.tsx` prerenders the
featured and on-sale rows, so with no `MONGODB_URI` the build stops at:

```
Error occurred prerendering page "/ka"
Error [MissingDatabaseUriError]: MONGODB_URI is not set.
Export encountered an error on /[locale]/page: /ka, exiting the build.
```

That failure is deliberate. A home page whose catalogue silently renders empty
is worse than a build that refuses to publish.

Consequence: **the build environment needs to reach Atlas**, not just the
running functions.

## 1. Environment variables

Set these in Vercel under Settings → Environment Variables, for Production
(and Preview, if you want preview deploys to work):

| Variable | Value |
|---|---|
| `MONGODB_URI` | The `mongodb+srv://` string, including `/strongwash` before the `?` |
| `AUTH_SECRET` | A **new** value, not the one in your local `.env.local` |
| `NEXT_PUBLIC_SITE_URL` | `https://<your-domain>` — optional; without it the code falls back to Vercel's own project URL |

Generate the production secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Keep it distinct from the development secret. Rotating `AUTH_SECRET`
invalidates every active session, so treat it as a deliberate act.

Leave the database name in the URI path. Without it, Mongoose connects to a
database called `test` and the site comes up empty against an empty cluster.

## 2. Atlas network access

Vercel's serverless functions and build containers use dynamic IP addresses,
so there is no stable range to allowlist. Two options:

- **Allowlist `0.0.0.0/0`** (Network Access → Add IP Address → Allow access
  from anywhere). Simple and standard for Vercel. It also means the database
  user's password is the only thing standing in front of the cluster — so use a
  dedicated user with `readWrite` on `strongwash` only, never the Atlas admin.
- **Private networking** — AWS PrivateLink or the Vercel↔Atlas integration.
  Keeps the cluster off the public internet; requires a dedicated tier (M10+).

Rotate the current database password before going live: it was shared in a
chat transcript during development, which is enough reason on its own.

## 3. Deploy

Import `tamomaxara1985-beep/strong-wash` on vercel.com. Framework detection
picks up Next.js; no build-command overrides are needed. Pushes to `main`
redeploy from then on.

## 4. Seed the production database

The catalogue ships as fixtures in `lib/mock`, not as data in the cluster. Run
the seed against whichever cluster production points at:

```bash
npm run seed
```

It reads `MONGODB_URI` from `.env.local` and is idempotent — keyed on brand and
category `slug` and on product `sku`, so re-running updates in place. It also
calls `syncIndexes()`, which is what stops the first production traffic being
served by collection scans.

If production and development share one cluster, they share one catalogue.
Separate databases (`/strongwash` vs `/strongwash-dev`) are the cheap fix.

## 5. Verify after the first deploy

```bash
curl -sI https://<domain>/            # 307 -> /ka
curl -s -o /dev/null -w '%{http_code}\n' https://<domain>/ka
curl -s https://<domain>/api/categories | head -c 200
```

A 500 on `/ka` with a working `/api/categories` means the seed has not run. A
503 with `database_not_configured` means `MONGODB_URI` is missing or still
holds placeholder credentials; the API routes report that case explicitly
rather than failing opaquely.

## Known consequence of the signed-in header

`SiteHeader` reads the session cookie, which opts every storefront route into
per-request rendering. The catalogue is correct but not statically cached, so
the ISR work in Phase 5 of `plan.md` will need the account chip moved into a
client component that calls `/api/auth/me`, or Partial Prerendering enabled.
