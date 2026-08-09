import { Types } from "mongoose";

import { Product } from "../models/product";
import { buildSearchText } from "../products/write";
import type { LocalizedString, ProductSpec } from "../types";

/**
 * The write side of a brand: the two operations that reach past the brand
 * document itself.
 */

export type DeleteBlock = { ok: true } | { ok: false; products: number };

/**
 * Deletion is refused while any product references the brand.
 *
 * `Product.brand` is required, so there is no orphan state to fall back to:
 * cascading would delete machines, and unsetting would leave documents that fail
 * validation on their next save. The brand can be deactivated instead, which
 * takes it out of the storefront filter and leaves everything intact.
 */
export async function canDelete(id: Types.ObjectId): Promise<DeleteBlock> {
  const products = await Product.countDocuments({ brand: id });
  return products > 0 ? { ok: false, products } : { ok: true };
}

const localized = (value: { ka?: string | null; en?: string | null; ru?: string | null } | null | undefined): LocalizedString => ({
  ka: value?.ka ?? "",
  en: value?.en ?? undefined,
  ru: value?.ru ?? undefined,
});

/**
 * Rewrites `searchText` for every product of a brand and returns how many changed.
 *
 * `searchText` is a denormalised per-locale haystack containing the brand name
 * (`lib/products/write.ts`), written once at product save and never recomputed.
 * It is read in exactly one place: the `q` branch of `buildFilters` in
 * `lib/queries/products.ts`, i.e. `/search?q=`. (`/api/search/suggest` matches on
 * `sku` and `name.*` only, so a stale `searchText` does not affect it.) Without
 * this pass a rename leaves that search matching a manufacturer that no longer
 * exists and missing the one that does, with nothing failing loudly.
 */
export async function repairBrandSearchText(
  id: Types.ObjectId,
  brandName: string,
): Promise<number> {
  const products = await Product.find({ brand: id })
    .select("name sku shortDescription specs")
    .lean();
  if (!products.length) return 0;

  const operations = products.map((product) => ({
    updateOne: {
      filter: { _id: product._id },
      update: {
        $set: {
          searchText: buildSearchText(
            {
              name: localized(product.name),
              sku: product.sku,
              shortDescription: localized(product.shortDescription),
            },
            brandName,
            (product.specs ?? []) as ProductSpec[],
          ),
        },
      },
    },
  }));

  const result = await Product.bulkWrite(operations);
  return result.modifiedCount ?? 0;
}
