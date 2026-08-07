import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api";
import {
  GoogleNotConfiguredError,
  buildAuthUrl,
  createPkce,
  randomToken,
} from "@/lib/auth/google";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import { DEFAULT_LOCALE } from "@/lib/types";

/** Short-lived, because they are only needed for the round trip to Google. */
const FLOW_COOKIE_MAX_AGE = 10 * 60;

const STATE_COOKIE = "sw_oauth_state";
const VERIFIER_COOKIE = "sw_oauth_verifier";
const NONCE_COOKIE = "sw_oauth_nonce";
const NEXT_COOKIE = "sw_oauth_next";

/** Same-site absolute paths only — see the sign-in page for why. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "";
  return raw;
}

/**
 * Starts the flow: generates state, nonce and a PKCE pair, stores them in
 * httpOnly cookies, and redirects to Google.
 *
 * The three secrets live in cookies rather than a server-side store because they
 * only have to survive one redirect and must be readable by the callback in the
 * same browser — which is exactly the binding that makes `state` work as CSRF
 * protection.
 */
export async function GET(request: NextRequest) {
  try {
    // The endpoint costs a round trip to Google, so it is worth a cap.
    const limited = rateLimit(`oauth-start:${clientIp(request)}`, 30, 10 * 60 * 1000);
    if (!limited.ok) {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
      );
    }

    const state = randomToken();
    const nonce = randomToken();
    const { verifier, challenge } = createPkce();
    const origin = request.nextUrl.origin;

    const target = buildAuthUrl({ origin, state, nonce, challenge });
    const response = NextResponse.redirect(target);

    const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      // `lax` rather than `strict`: the cookie has to survive Google's
      // cross-site redirect back to the callback, which `strict` would drop.
      sameSite: "lax" as const,
      path: "/",
      maxAge: FLOW_COOKIE_MAX_AGE,
    };

    response.cookies.set(STATE_COOKIE, state, options);
    response.cookies.set(VERIFIER_COOKIE, verifier, options);
    response.cookies.set(NONCE_COOKIE, nonce, options);

    const next = safeNext(request.nextUrl.searchParams.get("next"));
    if (next) response.cookies.set(NEXT_COOKIE, next, options);

    return response;
  } catch (error) {
    if (error instanceof GoogleNotConfiguredError) {
      // Sent back to the sign-in page with a code the form can translate, rather
      // than a JSON blob in the address bar.
      const url = new URL(`/${DEFAULT_LOCALE}/sign-in`, request.nextUrl.origin);
      url.searchParams.set("error", "google_unavailable");
      return NextResponse.redirect(url);
    }
    return apiError(error);
  }
}
