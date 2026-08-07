import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import type { HydratedDocument } from "mongoose";

import { connectToDatabase } from "../db";
import { PasswordResetToken } from "../models/password-reset-token";
import { User, type UserDocument } from "../models/user";

/** 60 minutes: long enough to find the email, short enough to limit exposure. */
export const RESET_TTL_MS = 60 * 60 * 1000;

/** 32 bytes of randomness — not guessable, so the stored hash needs no salt. */
export function createResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time comparison, so timing cannot be used to grind out a hash. */
function hashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * The user comes back hydrated, not lean: the confirm route has to write the new
 * hash and bump the session epoch, which needs a real document with `save()`.
 */
export type TokenLookup =
  | { ok: true; user: HydratedDocument<UserDocument>; tokenId: unknown }
  | { ok: false; reason: "invalid" | "expired" | "used" };

/**
 * Resolves a plaintext token to its account.
 *
 * Expiry is checked here as well as by the TTL index: Mongo's sweep runs about
 * once a minute, so an expired document can still be present and must not be
 * honoured.
 */
export async function lookupResetToken(token: string): Promise<TokenLookup> {
  if (!token || token.length < 20) return { ok: false, reason: "invalid" };
  await connectToDatabase();

  const tokenHash = hashToken(token);
  const record = await PasswordResetToken.findOne({ tokenHash });
  if (!record || !hashesEqual(record.tokenHash, tokenHash)) {
    return { ok: false, reason: "invalid" };
  }
  if (record.usedAt) return { ok: false, reason: "used" };
  if (record.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };

  const user = await User.findById(record.user);
  if (!user) return { ok: false, reason: "invalid" };

  return { ok: true, user, tokenId: record._id };
}
