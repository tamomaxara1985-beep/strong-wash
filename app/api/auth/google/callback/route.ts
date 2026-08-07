import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { resolveGoogleUser } from "@/lib/auth/google-account";
import {
  GoogleExchangeError,
  GoogleNotConfiguredError,
  exchangeCode,
} from "@/lib/auth/google";
import { setSessionCookie } from "@/lib/auth/session";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/types";

const STATE_COOKIE = "sw_oauth_state";
const VERIFIER_COOKIE = "sw_oauth_verifier";
const NONCE_COOKIE = "sw_oauth_nonce";
const NEXT_COOKIE = "sw_oauth_next";

/** Locale of the page the user started from, so errors come back readable. */
function localeFromNext(next: string): Locale {
  const match = next.match(/^\/(ka|en|ru)(?=\/|$)/);
  const candidate = match?.[1];
  return LOCALES.includes(candidate as Locale) ? (candidate as Locale) : DEFAULT_LOCALE;
}

function clearFlowCookies(response: NextResponse) {
  for (const name of [STATE_COOKIE, VERIFIER_COOKIE, NONCE_COOKIE, NEXT_COOKIE]) {
    response.cookies.set(name, "", { path: "/", maxAge: 0 });
  }
}

/**
 * Completes the flow.
 *
 * Every failure ends as a redirect to the sign-in page with an error code rather
 * than a JSON error: the user arrives here by browser navigation, so a raw
 * payload in the address bar would be a dead end.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const cookies = request.cookies;

  const next = cookies.get(NEXT_COOKIE)?.value ?? "";
  const locale = localeFromNext(next);
  const fail = (code: string) => {
    const url = new URL(`/${locale}/sign-in`, request.nextUrl.origin);
    url.searchParams.set("error", code);
    const response = NextResponse.redirect(url);
    clearFlowCookies(response);
    return response;
  };

  // The user pressed "Cancel" on Google's consent screen, or Google refused.
  const googleError = params.get("error");
  if (googleError) return fail(googleError === "access_denied" ? "google_cancelled" : "google_failed");

  const code = params.get("code");
  const state = params.get("state");
  const expectedState = cookies.get(STATE_COOKIE)?.value;
  const verifier = cookies.get(VERIFIER_COOKIE)?.value;
  const nonce = cookies.get(NONCE_COOKIE)?.value;

  /**
   * The state check is the CSRF defence: without it, an attacker could feed a
   * victim's browser a code from *their own* Google account and silently sign the
   * victim into the attacker's account. A missing cookie means the flow did not
   * start here, which is equally disqualifying.
   */
  if (!code || !state || !expectedState || !verifier || !nonce) return fail("google_failed");
  if (state !== expectedState) return fail("google_failed");

  try {
    const profile = await exchangeCode({
      code,
      origin: request.nextUrl.origin,
      verifier,
      nonce,
    });

    const outcome = await resolveGoogleUser(profile);
    if (outcome.kind === "rejected") return fail("google_email_unverified");

    const user = outcome.user;
    await setSessionCookie({
      userId: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role ?? "customer",
    });

    // `next` is validated when it is stored, so it is safe to follow here.
    const destination = next || `/${locale}/account`;
    const response = NextResponse.redirect(new URL(destination, request.nextUrl.origin));
    clearFlowCookies(response);
    return response;
  } catch (error) {
    if (error instanceof GoogleNotConfiguredError) return fail("google_unavailable");
    if (error instanceof GoogleExchangeError) {
      // A stale, replayed or tampered code. Logged server-side; the user just
      // gets asked to try again.
      console.error("[google]", error.message);
      return fail("google_failed");
    }
    console.error("[google] unexpected", error);
    return fail("google_failed");
  }
}
