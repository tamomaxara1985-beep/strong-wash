import { type InferSchemaType, type Model, Schema, model, models } from "mongoose";

export const USER_ROLES = ["customer", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

const userSchema = new Schema(
  {
    /**
     * Lowercased on write so "Ana@x.ge" and "ana@x.ge" cannot become two
     * accounts. The unique index is case-sensitive, so normalising at the
     * schema level is what actually enforces it.
     */
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    /**
     * bcrypt hash, cost 12. Never selected by default — see `select: false`.
     *
     * Optional because a Google-only account has no password to hash. Password
     * sign-in checks for its absence and refuses with the same generic error as
     * a wrong password, so the response cannot be used to discover which
     * accounts exist or how they authenticate.
     */
    passwordHash: { type: String, select: false },
    /**
     * Google's stable subject claim (`sub`), not the email.
     *
     * Google documents `sub` as the only immutable identifier — an address can be
     * reassigned within a Workspace domain, so matching on email alone would let
     * a later owner inherit the account. Sparse, because most accounts have none.
     */
    googleId: { type: String, unique: true, sparse: true, trim: true },
    /**
     * True once an identity provider has vouched for the address, or after a
     * verification flow of our own. Only a verified address may be linked to an
     * existing password account.
     */
    emailVerified: { type: Boolean, default: false },
    /** Google profile picture, if the account came from there. */
    avatarUrl: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    company: { type: String, trim: true },
    role: { type: String, enum: USER_ROLES, default: "customer" },
    savedProducts: {
      type: [{ type: Schema.Types.ObjectId, ref: "Product" }],
      default: [],
    },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type UserDocument = InferSchemaType<typeof userSchema>;

export const User: Model<UserDocument> =
  (models.User as Model<UserDocument>) ?? model<UserDocument>("User", userSchema);
