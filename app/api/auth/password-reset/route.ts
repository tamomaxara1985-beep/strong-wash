import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, validationError } from "@/lib/api";
import { assertSameOrigin } from "@/lib/auth/guard";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import { fieldErrors, passwordResetRequestSchema } from "@/lib/auth/schemas";
import { RESET_TTL_MS, createResetToken } from "@/lib/auth/reset-token";
import { connectToDatabase } from "@/lib/db";
import { EmailNotConfiguredError, sendMail } from "@/lib/email/mailer";
import { googleOnlyEmail, passwordResetEmail } from "@/lib/email/password-reset-email";
import { PasswordResetToken } from "@/lib/models/password-reset-token";
import { User } from "@/lib/models/user";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/types";

/**
 * Per-address and per-IP, because they stop different things: the address cap
 * keeps someone from mailbombing one person, the IP cap keeps a script from
 * spraying many addresses to find which ones exist.
 */
const MAX_PER_EMAIL = 3;
const MAX_PER_IP = 10;
const WINDOW_MS = 60 * 60 * 1000;

/**
 * Starts a password reset.
 *
 * Always answers 200 with the same body, whether or not the address has an
 * account. Anything else — a 404, a different message, even a measurably faster
 * reply — turns this endpoint into a way to enumerate customers, which is
 * precisely what an attacker wants before trying passwords anywhere else.
 *
 * The work therefore happens the same way in both branches, and mail failures are
 * logged rather than surfaced.
 */
export async function POST(request: NextRequest) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const ok = NextResponse.json({ ok: true });

  const byIp = rateLimit(`reset:ip:${clientIp(request)}`, MAX_PER_IP, WINDOW_MS);
  if (!byIp.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(byIp.retryAfter) } },
    );
  }

  try {
    const parsed = passwordResetRequestSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(fieldErrors(parsed.error));

    const { email } = parsed.data;
    const localeRaw = parsed.data.locale ?? "";
    const locale: Locale = LOCALES.includes(localeRaw as Locale)
      ? (localeRaw as Locale)
      : DEFAULT_LOCALE;

    const byEmail = rateLimit(`reset:email:${email}`, MAX_PER_EMAIL, WINDOW_MS);
    if (!byEmail.ok) {
      // Deliberately the same 200 as success: a 429 here would confirm that this
      // address has been asked about, which is halfway to confirming it exists.
      return ok;
    }

    await connectToDatabase();
    const user = await User.findOne({ email }).select("+passwordHash");
    if (!user) return ok;

    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;

    // A Google-only account has no password to reset. The mailbox owner is told
    // why; the requester still gets the same 200.
    if (!user.passwordHash) {
      const mail = googleOnlyEmail({ locale, signInUrl: `${origin}/${locale}/sign-in` });
      await sendMail({ to: user.email, ...mail }).catch((error) =>
        console.error("[reset] google-only notice failed", error),
      );
      return ok;
    }

    /**
     * Older tokens for this account are spent, not left alongside the new one:
     * two live links doubles the window in which a leaked email is useful.
     */
    await PasswordResetToken.updateMany(
      { user: user._id, usedAt: null },
      { $set: { usedAt: new Date() } },
    );

    const { token, tokenHash } = createResetToken();
    await PasswordResetToken.create({
      user: user._id,
      tokenHash,
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
      requestedIp: clientIp(request),
    });

    const url = `${origin}/${locale}/reset-password?token=${encodeURIComponent(token)}`;
    const mail = passwordResetEmail({ locale, name: user.name, url });

    try {
      const sent = await sendMail({ to: user.email, ...mail });
      if (sent.rejected.length) console.error("[reset] rejected recipients", sent.rejected);
    } catch (error) {
      // The caller is not told: a mail failure must not become a signal about
      // whether the address exists. Logged so an operator can see it.
      console.error("[reset] send failed", error);
    }

    return ok;
  } catch (error) {
    if (error instanceof EmailNotConfiguredError) {
      // Configuration is the operator's problem and safe to name.
      return NextResponse.json(
        { error: "email_not_configured", message: error.message },
        { status: 503 },
      );
    }
    return apiError(error);
  }
}
