import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, notFoundJson } from "@/lib/api";
import { getCategoryById, getEffectiveSpecSchema } from "@/lib/queries/categories";
import { getProductBySlug, getRelatedProducts } from "@/lib/queries/products";

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/products/[slug]">,
) {
  try {
    const { slug } = await context.params;
    const product = await getProductBySlug(slug);
    if (!product) return notFoundJson("product");

    const category = await getCategoryById(product.category);
    const [related, specSchema] = await Promise.all([
      getRelatedProducts(product, 4),
      category ? getEffectiveSpecSchema(category) : Promise.resolve([]),
    ]);

    // The schema travels with the product so a client can label and format the
    // raw spec values without a second call.
    return NextResponse.json({ product, related, specSchema, category: category ?? null });
  } catch (error) {
    return apiError(error);
  }
}
