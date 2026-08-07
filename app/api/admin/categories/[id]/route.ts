import { Types } from "mongoose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, notFoundJson, validationError } from "@/lib/api";
import { assertSameOrigin, requireAdmin } from "@/lib/auth/guard";
import { categorySchema, fieldErrors } from "@/lib/auth/schemas";
import { canDelete, reindexSubtree, wouldCreateCycle } from "@/lib/categories/write";
import { normaliseDescription } from "@/lib/categories/description";
import { connectToDatabase } from "@/lib/db";
import { Category } from "@/lib/models/category";

/**
 * Updates a category, reindexing the subtree when its lineage changes.
 *
 * Both the parent and the slug feed `path`, and the parent feeds `ancestors`, so
 * either one changing invalidates every descendant and every product beneath
 * them. That repair is the whole reason this handler is not a plain `$set`.
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/admin/categories/[id]">,
) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) return notFoundJson("category");

    const parsed = categorySchema.safeParse(await request.json());
    if (!parsed.success) return validationError(fieldErrors(parsed.error));

    await connectToDatabase();
    const category = await Category.findById(id);
    if (!category) return notFoundJson("category");

    const clash = await Category.findOne({ _id: { $ne: category._id }, slug: parsed.data.slug })
      .select("_id")
      .lean();
    if (clash) return validationError({ slug: "taken" });

    const parentRaw = parsed.data.parentId?.trim();
    let parentId: Types.ObjectId | null = null;
    if (parentRaw) {
      if (!Types.ObjectId.isValid(parentRaw)) return validationError({ parentId: "invalid" });
      const parent = await Category.findById(parentRaw).select("_id").lean();
      if (!parent) return validationError({ parentId: "not_found" });
      parentId = new Types.ObjectId(parentRaw);

      if (await wouldCreateCycle(category._id, parentId)) {
        // Its own descendant as a parent detaches the branch from every root: it
        // would disappear from the menu while still holding products.
        return validationError({ parentId: "would_create_cycle" });
      }
    }

    const lineageChanged =
      String(category.parent ?? "") !== String(parentId ?? "") || category.slug !== parsed.data.slug;

    category.slug = parsed.data.slug;
    category.name = parsed.data.name;
    category.description = normaliseDescription(parsed.data.description);
    category.parent = parentId;
    category.icon = parsed.data.icon || undefined;
    category.order = parsed.data.order;
    category.isActive = parsed.data.isActive;
    if (lineageChanged) category.markModified("parent");
    await category.save();

    const reindexed = lineageChanged
      ? await reindexSubtree(category._id)
      : { categories: 0, products: 0 };

    return NextResponse.json({
      id: String(category._id),
      path: category.path,
      reindexed,
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: number }).code === 11000) {
      return validationError({ slug: "taken" });
    }
    return apiError(error);
  }
}

/** Deletes a category, provided nothing depends on it. */
export async function DELETE(
  request: NextRequest,
  context: RouteContext<"/api/admin/categories/[id]">,
) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) return notFoundJson("category");

    await connectToDatabase();
    const category = await Category.findById(id).select("_id");
    if (!category) return notFoundJson("category");

    const verdict = await canDelete(category._id);
    if (!verdict.ok) {
      // Cascading would take products or whole branches with it, which is not
      // what removing a menu entry should mean.
      return NextResponse.json(
        {
          error: verdict.reason,
          ...(verdict.reason === "has_children"
            ? { children: verdict.children }
            : { products: verdict.products }),
        },
        { status: 409 },
      );
    }

    await category.deleteOne();
    return NextResponse.json({ deleted: id });
  } catch (error) {
    return apiError(error);
  }
}
