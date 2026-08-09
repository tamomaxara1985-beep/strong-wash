import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, validationError } from "@/lib/api";
import { assertSameOrigin, requireAdmin } from "@/lib/auth/guard";
import { brandSchema, fieldErrors } from "@/lib/auth/schemas";
import { normaliseDescription } from "@/lib/categories/description";
import { connectToDatabase } from "@/lib/db";
import { Brand } from "@/lib/models/brand";

/** Creates a manufacturer brand. */
export async function POST(request: NextRequest) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const parsed = brandSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(fieldErrors(parsed.error));

    await connectToDatabase();

    const clash = await Brand.findOne({ slug: parsed.data.slug }).select("_id").lean();
    if (clash) return validationError({ slug: "taken" });

    const doc = new Brand({
      slug: parsed.data.slug,
      name: parsed.data.name,
      description: normaliseDescription(parsed.data.description),
      order: parsed.data.order,
      isActive: parsed.data.isActive,
    });
    await doc.save();

    return NextResponse.json({ id: String(doc._id) }, { status: 201 });
  } catch (error) {
    // The pre-check above loses to a concurrent insert; the unique index does not.
    if (error instanceof Error && "code" in error && (error as { code?: number }).code === 11000) {
      return validationError({ slug: "taken" });
    }
    return apiError(error);
  }
}
