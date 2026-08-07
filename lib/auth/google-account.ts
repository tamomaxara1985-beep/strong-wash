import { connectToDatabase } from "../db";
import { User, type UserDocument } from "../models/user";
import type { GoogleProfile } from "./google";

/**
 * Turns a verified Google profile into an account.
 *
 * Kept separate from the route so the linking rules can be exercised directly:
 * they are the part with real consequences, and they cannot be tested through a
 * browser without a live Google login.
 */
export type ResolveOutcome =
  | { kind: "signed-in"; user: UserDocument & { _id: unknown } }
  | { kind: "created"; user: UserDocument & { _id: unknown } }
  | { kind: "linked"; user: UserDocument & { _id: unknown } }
  | { kind: "rejected"; reason: "email_unverified" };

export async function resolveGoogleUser(profile: GoogleProfile): Promise<ResolveOutcome> {
  await connectToDatabase();

  /**
   * Matched on `sub` first, never on email alone. Google documents `sub` as the
   * only immutable identifier; an address inside a Workspace domain can be
   * reassigned to a new person, and matching by email would hand them the
   * previous owner's account.
   */
  const byGoogleId = await User.findOne({ googleId: profile.googleId });
  if (byGoogleId) {
    // Refresh only the fields Google owns. The name is left alone: it may have
    // been edited here or by an admin, and Google is not the authority on it
    // after the account exists.
    if (profile.picture && byGoogleId.avatarUrl !== profile.picture) {
      byGoogleId.avatarUrl = profile.picture;
    }
    if (!byGoogleId.emailVerified && profile.emailVerified) {
      byGoogleId.emailVerified = true;
    }
    // Always saved, because this write is what records the sign-in.
    byGoogleId.lastLoginAt = new Date();
    await byGoogleId.save();
    return { kind: "signed-in", user: byGoogleId as UserDocument & { _id: unknown } };
  }

  const byEmail = await User.findOne({ email: profile.email });

  if (byEmail) {
    /**
     * Linking requires Google to have verified the address. Without that check,
     * anyone able to create an account at an identity provider claiming
     * `victim@example.com` could take over the local account of that name — the
     * classic account-linking hijack.
     */
    if (!profile.emailVerified) return { kind: "rejected", reason: "email_unverified" };

    byEmail.googleId = profile.googleId;
    byEmail.emailVerified = true;
    if (profile.picture && !byEmail.avatarUrl) byEmail.avatarUrl = profile.picture;
    byEmail.lastLoginAt = new Date();
    await byEmail.save();
    return { kind: "linked", user: byEmail as UserDocument & { _id: unknown } };
  }

  if (!profile.emailVerified) return { kind: "rejected", reason: "email_unverified" };

  /**
   * A fresh account with no password hash: there is nothing to hash, and inventing
   * a random one would leave an unusable credential on the record. `role` takes
   * the schema default, so Google can never mint an admin.
   */
  const created = await User.create({
    email: profile.email,
    name: profile.name,
    googleId: profile.googleId,
    emailVerified: true,
    avatarUrl: profile.picture,
    lastLoginAt: new Date(),
  });

  return { kind: "created", user: created as UserDocument & { _id: unknown } };
}
