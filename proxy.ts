import createMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { routing } from "@/i18n/routing";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

// Next.js 16 renamed Middleware to Proxy. next-intl still ships its factory
// from `next-intl/middleware`; only the file name and export name changed.
const intlProxy = createMiddleware(routing);

/** Locale-prefixed paths that require a session, matched after the `/xx` prefix. */
const PROTECTED = ["/account"];

function isProtected(pathname: string): boolean {
  const withoutLocale = pathname.replace(/^\/(ka|en|ru)(?=\/|$)/, "");
  return PROTECTED.some(
    (prefix) => withoutLocale === prefix || withoutLocale.startsWith(`${prefix}/`),
  );
}

/**
 * Locale routing, plus a cheap session gate.
 *
 * None of this is authorisation. It verifies the cookie's signature but cannot
 * know whether the account still exists or is still an admin — those claims were
 * true when the token was issued. Every protected page and `/api/admin` handler
 * re-reads the user from the database; see `lib/auth/guard.ts`.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  /**
   * `/admin` is deliberately unlocalised (plan.md: English UI for operators), so
   * it must bypass the intl middleware entirely — otherwise next-intl rewrites it
   * to `/ka/admin` and the route 404s.
   */
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const session = token ? await verifySession(token) : null;

    if (!session) {
      const url = request.nextUrl.clone();
      url.pathname = `/${routing.defaultLocale}/sign-in`;
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }

    // A signed-in non-admin is let through to the layout, which does the real
    // check against the database and answers 404. Deciding it here on the
    // cookie's role claim would trust a value that may be stale.
    return NextResponse.next();
  }

  if (isProtected(pathname)) {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const session = token ? await verifySession(token) : null;

    if (!session) {
      const locale = pathname.match(/^\/(ka|en|ru)(?=\/|$)/)?.[1] ?? routing.defaultLocale;
      const url = request.nextUrl.clone();
      url.pathname = `/${locale}/sign-in`;
      // Where they were headed, so sign-in can send them back.
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
  }

  return intlProxy(request);
}

export const config = {
  // Skip API routes, Next internals, and anything with a file extension.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
