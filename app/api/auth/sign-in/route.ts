import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, validationError } from "@/lib/api";
import { assertSameOrigin } from "@/lib/auth/guard";
import { fakeVerify, verifyPassword } from "@/lib/auth/password";
import { clientIp, rateLimit, resetRateLimit } from "@/lib/auth/rate-limit";
import { fieldErrors, signInSchema } from "@/lib/auth/schemas";
import { setSessionCookie } from "@/lib/auth/session";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/lib/models/user";

/**
 * Two windows, because they stop different attacks. Per-IP caps a scripted spray
 * across many accounts; per-account caps a slow distributed guess at one account
 * from many addresses.
 */
const MAX_PER_IP = 10;
const MAX_PER_ACCOUNT = 5;
const WINDOW_MS = 10 * 60 * 1000;

/** One message for every failure mode. Never "no such user" or "wrong password". */
function invalidCredentials() {
  return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
}

export async function POST(request: NextRequest) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const ip = clientIp(request);
  const byIp = rateLimit(`sign-in:ip:${ip}`, MAX_PER_IP, WINDOW_MS);
  if (!byIp.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(byIp.retryAfter) } },
    );
  }

  try {
    const parsed = signInSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(fieldErrors(parsed.error));
    const { email, password } = parsed.data;

    const accountKey = `sign-in:account:${email}`;
    const byAccount = rateLimit(accountKey, MAX_PER_ACCOUNT, WINDOW_MS);
    if (!byAccount.ok) {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: { "Retry-After": String(byAccount.retryAfter) } },
      );
    }

    await connectToDatabase();
    // `passwordHash` is `select: false`, so it has to be asked for explicitly.
    const user = await User.findOne({ email }).select("+passwordHash");

    if (!user) {
      // Spend the same time as a real comparison: returning early here makes
      // response latency a reliable "does this account exist" signal.
      await fakeVerify();
      return invalidCredentials();
    }

    /**
     * A Google-only account has no hash to compare against.
     *
     * Answered with the same generic error and the same spent time as a wrong
     * password: saying "this account uses Google" would confirm the address
     * exists and reveal how it authenticates, which is exactly what the generic
     * message exists to prevent. The sign-in page already offers the Google
     * button beside the form, so the way forward is visible without being told.
     */
    if (!user.passwordHash) {
      await fakeVerify();
      return invalidCredentials();
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return invalidCredentials();

    user.lastLoginAt = new Date();
    await user.save();

    await setSessionCookie({
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role ?? "customer",
      epoch: user.sessionEpoch ?? 0,
    });

    // A legitimate user who mistyped twice should not stay throttled after
    // proving who they are.
    resetRateLimit(accountKey);

    return NextResponse.json({
      user: { id: user._id.toString(), email: user.email, name: user.name, role: user.role },
    });
  } catch (error) {
    return apiError(error);
  }
}
