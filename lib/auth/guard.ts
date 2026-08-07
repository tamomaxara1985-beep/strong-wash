import { NextResponse } from "next/server";

import { connectToDatabase } from "../db";
import { User, type UserDocument } from "../models/user";
import { getSession } from "./session";

/**
 * Rejects a mutating request whose `Origin` does not match the host it reached.
 *
 * The session cookie is `sameSite: lax`, which already stops a cross-site form
 * POST from carrying it. This is the second layer, and the one that also covers
 * same-site-but-untrusted subdomains. A missing `Origin` is allowed because
 * non-browser clients (curl, the seed scripts, server-to-server) do not send one
 * — browsers always do on POST, so a forged request cannot simply omit it.
 */
export function assertSameOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  const host = request.headers.get("host");
  try {
    if (new URL(origin).host === host) return null;
  } catch {
    // Unparsable Origin — treat as hostile.
  }
  return NextResponse.json({ error: "cross_origin_rejected" }, { status: 403 });
}

export type AuthedUser = UserDocument & { _id: unknown };

/**
 * Loads the signed-in user from the database.
 *
 * Route handlers must not authorise from the cookie's claims alone: the token
 * carries a role that was true when it was issued, and a user can be demoted or
 * deleted while holding a valid one. Middleware gating a path is not
 * authorisation either — every handler re-checks here.
 */
export async function requireUser(): Promise<
  { user: AuthedUser; userId: string } | { response: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return { response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
  }

  await connectToDatabase();
  const user = await User.findById(session.userId);
  if (!user) {
    // Valid signature, vanished account: the cookie outlived the user.
    return { response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
  }

  return { user: user as AuthedUser, userId: session.userId };
}

export async function requireAdmin(): Promise<
  { user: AuthedUser; userId: string } | { response: NextResponse }
> {
  const result = await requireUser();
  if ("response" in result) return result;
  if (result.user.role !== "admin") {
    return { response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return result;
}
