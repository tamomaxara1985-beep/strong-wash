import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, validationError } from "@/lib/api";
import { assertSameOrigin } from "@/lib/auth/guard";
import { hashPassword } from "@/lib/auth/password";
import { clientIp, rateLimit, resetRateLimit } from "@/lib/auth/rate-limit";
import { lookupResetToken } from "@/lib/auth/reset-token";
import { fieldErrors, passwordResetConfirmSchema } from "@/lib/auth/schemas";
import { setSessionCookie } from "@/lib/auth/session";
import { PasswordResetToken } from "@/lib/models/password-reset-token";

/** Guessing a 32-byte token is hopeless, but the attempt is still capped. */
const MAX_PER_IP = 20;
const WINDOW_MS = 60 * 60 * 1000;

/**
 * Spends the token and sets the new password.
 *
 * Order matters: the token is marked used *before* the password is written, so a
 * request that races itself cannot apply twice.
 */
export async function POST(request: NextRequest) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const limited = rateLimit(`reset-confirm:${clientIp(request)}`, MAX_PER_IP, WINDOW_MS);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
    );
  }

  try {
    const parsed = passwordResetConfirmSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(fieldErrors(parsed.error));

    const lookup = await lookupResetToken(parsed.data.token);
    if (!lookup.ok) {
      // The three cases are distinguished on purpose: this endpoint is reached by
      // someone holding a link from their own inbox, so "expired" versus
      // "already used" is the difference between a useful message and a
      // dead end. Neither reveals anything about other accounts.
      return NextResponse.json({ error: "token_" + lookup.reason }, { status: 400 });
    }

    const { user, tokenId } = lookup;

    // Claimed atomically: a concurrent second request finds usedAt already set.
    const claimed = await PasswordResetToken.findOneAndUpdate(
      { _id: tokenId, usedAt: null },
      { $set: { usedAt: new Date() } },
    );
    if (!claimed) return NextResponse.json({ error: "token_used" }, { status: 400 });

    user.passwordHash = await hashPassword(parsed.data.password);
    /**
     * Retires every session issued before now. Someone resetting because a
     * device was stolen expects exactly that; without it the thief's cookie keeps
     * working until it expires.
     */
    user.sessionEpoch = (user.sessionEpoch ?? 0) + 1;
    // A reset proves control of the mailbox, which is what verification means.
    user.emailVerified = true;
    await user.save();

    // Signed in immediately: they have just proved control of the address and
    // chosen a password, so a second login form would be friction for nothing.
    await setSessionCookie({
      userId: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role ?? "customer",
      epoch: user.sessionEpoch,
    });

    // Their earlier failed sign-ins should not keep them throttled now.
    resetRateLimit(`sign-in:account:${user.email}`);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
