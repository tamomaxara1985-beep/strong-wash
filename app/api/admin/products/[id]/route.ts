import { Types } from "mongoose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, notFoundJson, validationError } from "@/lib/api";
import { assertSameOrigin, requireAdmin } from "@/lib/auth/guard";
import { fieldErrors, productSchema } from "@/lib/auth/schemas";
import { connectToDatabase } from "@/lib/db";
import { Product } from "@/lib/models/product";
import { QuoteRequest } from "@/lib/models/quote-request";
import { buildProduct } from "@/lib/products/write";

function failuresToFields(failures: { field: string; code: string }[]): Record<string, string> {
  return Object.fromEntries(failures.map((f) => [f.field, f.code]));
}

/** Replaces the editable fields of one product. */
export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/admin/products/[id]">,
) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) return notFoundJson("product");

    const parsed = productSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(fieldErrors(parsed.error));

    await connectToDatabase();
    const existing = await Product.findById(id);
    if (!existing) return notFoundJson("product");

    // Uniqueness excluding this document, so saving without changing the sku is
    // not reported as a clash with itself.
    const clash = await Product.findOne({
      _id: { $ne: existing._id },
      $or: [{ sku: parsed.data.sku }, { slug: parsed.data.slug }],
    })
      .select("sku slug")
      .lean();
    if (clash) {
      return validationError({
        ...(clash.sku === parsed.data.sku ? { sku: "taken" } : {}),
        ...(clash.slug === parsed.data.slug ? { slug: "taken" } : {}),
      });
    }

    const built = await buildProduct({
      ...parsed.data,
      salePrice: parsed.data.salePrice ?? null,
      images: parsed.data.images.map((image, index) => ({ ...image, order: index + 1 })),
    });
    if ("failures" in built) return validationError(failuresToFields(built.failures));

    // `set` then `save`, so the pre-validate hook recomputes effectivePrice.
    existing.set(built.product);
    await existing.save();

    return NextResponse.json({ id: String(existing._id), slug: existing.slug });
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: number }).code === 11000) {
      return validationError({ sku: "taken", slug: "taken" });
    }
    return apiError(error);
  }
}

/**
 * Deletes a product, unless an enquiry references it.
 *
 * A quote request records which machine someone asked about; deleting the product
 * would leave that history pointing at nothing. Refusing and pointing the admin
 * at the active/inactive flag keeps the sales record intact — deactivating hides
 * it from the storefront, which is what "remove it from the site" actually means.
 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext<"/api/admin/products/[id]">,
) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) return notFoundJson("product");

    await connectToDatabase();
    const product = await Product.findById(id).select("_id");
    if (!product) return notFoundJson("product");

    const quotes = await QuoteRequest.countDocuments({ product: product._id });
    if (quotes > 0) {
      return NextResponse.json(
        { error: "referenced_by_quotes", quotes },
        { status: 409 },
      );
    }

    await product.deleteOne();
    return NextResponse.json({ deleted: id });
  } catch (error) {
    return apiError(error);
  }
}
