import { z } from "zod";

/**
 * Server-side validation. The forms mirror these rules for feedback, but the
 * route handlers are the enforcement point — a client can post anything.
 */

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .email();

/**
 * Length over composition rules. Character-class requirements push people to
 * `Password1!` and buy little; 10 characters minimum with no upper bound below
 * bcrypt's own limit is the better trade.
 *
 * The 72-byte cap is bcrypt's, not a policy choice: it silently truncates beyond
 * that, so a longer passphrase would have unused tail bytes and two different
 * passphrases could collide.
 */
const password = z
  .string()
  .min(10, "too_short")
  .refine((value) => new TextEncoder().encode(value).length <= 72, "too_long");

export const signUpSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email,
  password,
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  company: z.string().trim().max(160).optional().or(z.literal("")),
});

export const signInSchema = z.object({
  email,
  // Not the strict rule: an existing account may predate a policy change, and
  // rejecting its password at the schema would lock the user out of their own
  // account with a validation error.
  password: z.string().min(1),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  company: z.string().trim().max(160).optional().or(z.literal("")),
});

export const quoteRequestSchema = z.object({
  productSlug: z.string().trim().min(1),
  name: z.string().trim().min(2).max(120),
  email,
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  company: z.string().trim().max(160).optional().or(z.literal("")),
  message: z.string().trim().max(4000).optional().or(z.literal("")),
});

export const savedProductSchema = z.object({
  productId: z.string().trim().min(1),
  action: z.enum(["add", "remove"]),
});

/** Flattens Zod issues into the `{field: code}` shape the API contract uses. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    fields[key] ??= issue.message;
  }
  return fields;
}
