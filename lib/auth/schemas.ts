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

/**
 * A `{ka, en, ru}` field. Georgian is required everywhere the storefront falls
 * back to it, which is everywhere — `pickLocale` reads `ka` when a translation is
 * missing, so an empty `ka` would render as blank rather than as English.
 */
const localizedRequired = z.object({
  ka: z.string().trim().min(1, "required").max(2000),
  en: z.string().trim().max(2000).optional().or(z.literal("")),
  ru: z.string().trim().max(2000).optional().or(z.literal("")),
});

/** Slugs appear in URLs, so the shape is constrained rather than sanitised. */
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug_format");

export const productSchema = z.object({
  sku: z.string().trim().min(2).max(60),
  slug,
  name: localizedRequired,
  shortDescription: localizedRequired,
  description: localizedRequired,
  brandId: z.string().trim().min(1),
  categoryId: z.string().trim().min(1),
  /**
   * `z.coerce.number()` is not used on its own anywhere here.
   *
   * Coercion runs `Number(value)`, and `Number(null)` is `0` — which passes
   * `min(0)`. A union with `z.null()` after it never even gets tried, so a null
   * sale price silently became 0 and the derived `effectivePrice` went to 0 with
   * it, marking every product as free. Emptiness is therefore mapped to the
   * intended value *before* any coercion.
   */
  price: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.coerce.number().min(0).max(100_000_000),
  ),
  /** `null` means "no sale"; an empty form field means the same thing. */
  salePrice: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? null : value),
    z.union([z.null(), z.coerce.number().min(0).max(100_000_000)]),
  ),
  stock: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? 0 : value),
    z.coerce.number().int().min(0).max(1_000_000),
  ),
  stockStatus: z.enum(["in_stock", "low", "out", "preorder"]),
  images: z
    .array(
      z.object({
        url: z.string().trim().url(),
        alt: localizedRequired,
      }),
    )
    .max(12),
  specs: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
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
