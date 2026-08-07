import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, notFoundJson } from "@/lib/api";
import {
  getCategoryBySlug,
  getCategoryTrail,
  getChildren,
  getEffectiveSpecSchema,
} from "@/lib/queries/categories";

/**
 * A category plus its *effective* spec schema — its own definitions merged with
 * every ancestor's. That merged list is the facet contract for the listing page,
 * so a client rendering filters needs it in one call.
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/categories/[slug]">,
) {
  try {
    const { slug } = await context.params;
    const category = await getCategoryBySlug(slug);
    if (!category) return notFoundJson("category");

    const [schema, children, trail] = await Promise.all([
      getEffectiveSpecSchema(category),
      getChildren(category.id),
      getCategoryTrail(category),
    ]);

    return NextResponse.json({ category, specSchema: schema, children, trail });
  } catch (error) {
    return apiError(error);
  }
}
