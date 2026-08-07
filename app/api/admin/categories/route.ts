import { Types } from "mongoose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, validationError } from "@/lib/api";
import { assertSameOrigin, requireAdmin } from "@/lib/auth/guard";
import { categorySchema, fieldErrors } from "@/lib/auth/schemas";
import { normaliseDescription } from "@/lib/categories/description";
import { connectToDatabase } from "@/lib/db";
import { Category } from "@/lib/models/category";

/** Creates a category, at the top level or under a parent. */
export async function POST(request: NextRequest) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const parsed = categorySchema.safeParse(await request.json());
    if (!parsed.success) return validationError(fieldErrors(parsed.error));

    await connectToDatabase();

    const clash = await Category.findOne({ slug: parsed.data.slug }).select("_id").lean();
    if (clash) return validationError({ slug: "taken" });

    const parentId = parsed.data.parentId?.trim();
    if (parentId) {
      if (!Types.ObjectId.isValid(parentId)) return validationError({ parentId: "invalid" });
      const parent = await Category.findById(parentId).select("_id").lean();
      if (!parent) return validationError({ parentId: "not_found" });
    }

    /**
     * `path` is left for the pre-validate hook, which derives it from the parent.
     * Passing one here would let a caller invent a lineage that does not match
     * the tree.
     */
    const doc = new Category({
      slug: parsed.data.slug,
      name: parsed.data.name,
      description: normaliseDescription(parsed.data.description),
      parent: parentId ? new Types.ObjectId(parentId) : null,
      icon: parsed.data.icon || undefined,
      order: parsed.data.order,
      isActive: parsed.data.isActive,
      // Attribute definitions are not editable from the panel yet; a new
      // category inherits its ancestors' and starts with none of its own.
      specSchema: [],
    });
    await doc.save();

    return NextResponse.json({ id: String(doc._id), path: doc.path }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: number }).code === 11000) {
      return validationError({ slug: "taken" });
    }
    return apiError(error);
  }
}
