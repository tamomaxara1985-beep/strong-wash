import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { getCategoryTree } from "@/lib/queries/categories";
import { countProductsPerCategory } from "@/lib/queries/products";

/**
 * The full tree, with subtree product counts. Server components read the query
 * layer directly; this exists for the client-side nav and, in Phase 4, the admin
 * panel.
 */
export async function GET() {
  try {
    const [tree, counts] = await Promise.all([getCategoryTree(), countProductsPerCategory()]);
    return NextResponse.json({
      categories: tree,
      counts: Object.fromEntries(counts),
    });
  } catch (error) {
    return apiError(error);
  }
}
