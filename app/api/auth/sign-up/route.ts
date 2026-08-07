import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, validationError } from "@/lib/api";
import { assertSameOrigin } from "@/lib/auth/guard";
import { hashPassword } from "@/lib/auth/password";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import { fieldErrors, signUpSchema } from "@/lib/auth/schemas";
import { setSessionCookie } from "@/lib/auth/session";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/lib/models/user";

/**
 * Registration is cheap to script, so it is capped per address.
 *
 * 20 an hour rather than a handful: a B2B customer's staff share one office IP
 * behind NAT, and a limit tight enough to catch a script would lock out a real
 * second colleague signing up the same afternoon.
 */
const MAX_PER_IP = 20;
const WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  try {
    const parsed = signUpSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(fieldErrors(parsed.error));
    const { name, email, password, phone, company } = parsed.data;

    // Counted after validation: a mistyped email is a user fumbling the form,
    // not an attempt at an account, and burning their quota for it just breaks
    // the flow for someone who is already struggling.
    const limited = rateLimit(`sign-up:${clientIp(request)}`, MAX_PER_IP, WINDOW_MS);
    if (!limited.ok) {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
      );
    }

    await connectToDatabase();

    // Hash before the existence check so both branches do the expensive work:
    // an instant "email taken" versus a slow success is an enumeration oracle.
    const passwordHash = await hashPassword(password);

    const existing = await User.findOne({ email }).select("_id").lean();
    if (existing) {
      /**
       * Deliberately 409 with a plain message. Self-registration cannot hide
       * that an address is taken — the flow has to tell the person to sign in
       * instead — so the honest response is the useful one here. Sign-in stays
       * generic, which is where enumeration actually matters.
       */
      return NextResponse.json({ error: "email_taken" }, { status: 409 });
    }

    const user = await User.create({
      name,
      email,
      passwordHash,
      phone: phone || undefined,
      company: company || undefined,
      role: "customer",
      lastLoginAt: new Date(),
    });

    await setSessionCookie({
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role ?? "customer",
      epoch: user.sessionEpoch ?? 0,
    });

    return NextResponse.json(
      {
        user: { id: user._id.toString(), email: user.email, name: user.name, role: user.role },
      },
      { status: 201 },
    );
  } catch (error) {
    // Two concurrent sign-ups for the same address both pass the check above;
    // the unique index is what actually decides, so surface its verdict as the
    // same 409 rather than a 500.
    if (error instanceof Error && "code" in error && (error as { code?: number }).code === 11000) {
      return NextResponse.json({ error: "email_taken" }, { status: 409 });
    }
    return apiError(error);
  }
}
