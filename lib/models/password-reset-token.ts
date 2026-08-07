import { type InferSchemaType, type Model, Schema, model, models } from "mongoose";

/**
 * A single-use password-reset token.
 *
 * Only the SHA-256 of the token is stored. The plaintext exists in exactly two
 * places — the email and the user's clipboard — so a leaked database dump cannot
 * be used to reset anyone's password. Hashing is enough here without a salt or a
 * slow KDF: the token is 32 random bytes, so there is no dictionary to attack.
 */
const passwordResetTokenSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    /** Set the moment it is spent, so a replayed link is refused. */
    usedAt: { type: Date, default: null },
    /** Kept for abuse investigation, not for authorisation. */
    requestedIp: { type: String, trim: true },
  },
  { timestamps: true },
);

passwordResetTokenSchema.index({ user: 1, createdAt: -1 });

/**
 * Mongo removes documents once `expiresAt` passes, so spent and stale tokens do
 * not accumulate. The sweep runs about once a minute, which is why expiry is
 * *also* checked at read time rather than relying on the document being gone.
 */
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type PasswordResetTokenDocument = InferSchemaType<typeof passwordResetTokenSchema>;

export const PasswordResetToken: Model<PasswordResetTokenDocument> =
  (models.PasswordResetToken as Model<PasswordResetTokenDocument>) ??
  model<PasswordResetTokenDocument>("PasswordResetToken", passwordResetTokenSchema);
