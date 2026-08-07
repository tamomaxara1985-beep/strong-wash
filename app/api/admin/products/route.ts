import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, validationError } from "@/lib/api";
import { assertSameOrigin, requireAdmin } from "@/lib/auth/guard";
import { fieldErrors, productSchema } from "@/lib/auth/schemas";
import { connectToDatabase } from "@/lib/db";
import { Product } from "@/lib/models/product";
import { buildProduct } from "@/lib/products/write";

function failuresToFields(failures: { field: string; code: string }[]): Record<string, string> {
  return Object.fromEntries(failures.map((f) => [f.field, f.code]));
}

/** Creates a product. */
export async function POST(request: NextRequest) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const parsed = productSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(fieldErrors(parsed.error));

    await connectToDatabase();

    // Checked before writing so the form can point at the field, rather than
    // relying on the unique index to produce an opaque 11000.
    const clash = await Product.findOne({
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

    const doc = await Product.create(built.product);
    return NextResponse.json({ id: String(doc._id), slug: doc.slug }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: number }).code === 11000) {
      // Two concurrent creates for the same sku/slug: the index decides.
      return validationError({ sku: "taken", slug: "taken" });
    }
    return apiError(error);
  }
}
