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
    /** bcrypt hash, cost 12. Never selected by default — see `select: false`. */
    passwordHash: { type: String, required: true, select: false },
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
