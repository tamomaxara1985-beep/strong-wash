import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

import type { UserRole } from "../models/user";

export const SESSION_COOKIE = "sw_session";

/** 30 days. Re-issued on every sign-in, not slid on each request. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type SessionPayload = {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
};

/**
 * `jose` rather than `jsonwebtoken` because the session has to be verifiable in
 * `proxy.ts`, which runs on the Edge runtime where Node's `crypto` is absent.
 */
function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Generate one with: " +
        `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`,
    );
  }
  return new TextEncoder().encode(value);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
}

/**
 * Returns null for anything that is not a currently valid session — expired,
 * tampered, signed with a rotated secret. Callers treat null as signed out.
 */
export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    const { userId, email, name, role } = payload as Record<string, unknown>;
    if (typeof userId !== "string" || typeof email !== "string") return null;
    return {
      userId,
      email,
      name: typeof name === "string" ? name : "",
      role: role === "admin" ? "admin" : "customer",
    };
  } catch {
    return null;
  }
}

/**
 * The session as the current request sees it.
 *
 * The name and role ride in the token so the header does not read the database
 * on every page. The cost is staleness: a profile or role change only shows up
 * once the cookie is re-issued, which `setSessionCookie` does on sign-in and on
 * profile update. Anything authorising a *mutation* must load the user instead of
 * trusting these claims.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await signSession(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Off over plain HTTP in dev, or the browser drops the cookie on localhost.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
