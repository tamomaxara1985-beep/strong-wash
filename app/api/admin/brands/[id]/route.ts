import { Types } from "mongoose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, notFoundJson, validationError } from "@/lib/api";
import { assertSameOrigin, requireAdmin } from "@/lib/auth/guard";
import { brandSchema, fieldErrors } from "@/lib/auth/schemas";
import { canDelete, repairBrandSearchText } from "@/lib/brands/write";
import { normaliseDescription } from "@/lib/categories/description";
import { connectToDatabase } from "@/lib/db";
import { Brand } from "@/lib/models/brand";

/**
 * Updates a brand, then unconditionally repairs its products' `searchText`.
 *
 * The repair is the reason this is not a plain `$set`: every product stores the
 * brand name inside `searchText`, so a rename without it leaves the search
 * matching a manufacturer that no longer exists. A slug change needs nothing —
 * product slugs are resolved live, never stored on the product.
 *
 * It runs on every successful save, not only when the name changed. Gating it on
 * a `renamed` check made a failed repair unretryable: if `repairBrandSearchText`
 * threw, the rename was already committed, the handler returned 500, and a retry
 * saw an unchanged name and skipped the repair — leaving the catalogue
 * permanently mis-indexed. `repairBrandSearchText` rebuilds each product's
 * haystack from that product's own stored fields plus the current brand name, so
 * it is idempotent: a no-op rename costs one harmless pass and a retry after a
 * partial `bulkWrite` heals it. `modifiedCount` still reports 0 when nothing
 * changed, which is what the form keys `Reindexed N products.` on.
 */
export async function PATCH(request: NextRequest, context: RouteContext<"/api/admin/brands/[id]">) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) return notFoundJson("brand");

    const parsed = brandSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(fieldErrors(parsed.error));

    await connectToDatabase();
    const brand = await Brand.findById(id);
    if (!brand) return notFoundJson("brand");

    const clash = await Brand.findOne({ _id: { $ne: brand._id }, slug: parsed.data.slug })
      .select("_id")
      .lean();
    if (clash) return validationError({ slug: "taken" });

    brand.slug = parsed.data.slug;
    brand.name = parsed.data.name;
    brand.description = normaliseDescription(parsed.data.description);
    brand.order = parsed.data.order;
    brand.isActive = parsed.data.isActive;
    await brand.save();

    const repaired = await repairBrandSearchText(brand._id, brand.name);

    return NextResponse.json({ id: String(brand._id), repaired });
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: number }).code === 11000) {
      return validationError({ slug: "taken" });
    }
    return apiError(error);
  }
}

/** Deletes a brand, provided no product references it. */
export async function DELETE(request: NextRequest, context: RouteContext<"/api/admin/brands/[id]">) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) return notFoundJson("brand");

    await connectToDatabase();
    const brand = await Brand.findById(id).select("_id");
    if (!brand) return notFoundJson("brand");

    const verdict = await canDelete(brand._id);
    if (!verdict.ok) {
      // Product.brand is required, so there is no orphan state: the products would
      // either have to go too, or be left invalid. Hiding the brand is the answer.
      return NextResponse.json(
        { error: "has_products", products: verdict.products },
        { status: 409 },
      );
    }

    await brand.deleteOne();
    return NextResponse.json({ deleted: id });
  } catch (error) {
    return apiError(error);
  }
}
