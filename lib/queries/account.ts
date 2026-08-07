import { Types } from "mongoose";

import { connectToDatabase } from "../db";
import { Product as ProductModel } from "../models/product";
import { QuoteRequest } from "../models/quote-request";
import { User } from "../models/user";
import type { LocalizedString, Product } from "../types";
import { getAllBrands } from "./brands";
import { toProduct } from "./map";

export type SavedProduct = Product & { savedAt: null };

/**
 * The signed-in user's saved equipment, in the order the products come back.
 *
 * Reads the id list from the user document and fetches the products separately
 * rather than `populate()`-ing: an inactive or deleted product should silently
 * drop out of the list instead of rendering as a broken row.
 */
export async function getSavedProducts(userId: string): Promise<Product[]> {
  if (!Types.ObjectId.isValid(userId)) return [];
  await connectToDatabase();

  const user = await User.findById(userId).select("savedProducts").lean();
  const ids = user?.savedProducts ?? [];
  if (!ids.length) return [];

  const [docs, brands] = await Promise.all([
    ProductModel.find({ _id: { $in: ids }, isActive: true }).lean(),
    getAllBrands(),
  ]);

  const brandById = new Map(brands.map((b) => [b.id, b]));
  return docs.map((doc) => {
    const product = toProduct(doc);
    const brand = brandById.get(product.brand);
    return { ...product, brandSlug: brand?.slug ?? "", brandName: brand?.name ?? "" };
  });
}

export async function getSavedProductIds(userId: string): Promise<Set<string>> {
  if (!Types.ObjectId.isValid(userId)) return new Set();
  await connectToDatabase();
  const user = await User.findById(userId).select("savedProducts").lean();
  return new Set((user?.savedProducts ?? []).map((id) => id.toString()));
}

export type QuoteAttachment = {
  url: string;
  bytes: number;
  format: string;
  originalName: string;
  isImage: boolean;
};

export type QuoteRequestSummary = {
  id: string;
  status: "new" | "contacted" | "closed";
  createdAt: string;
  message?: string;
  attachments: QuoteAttachment[];
  product: { slug: string; name: LocalizedString } | null;
};

const IMAGE_FORMATS = new Set(["jpg", "jpeg", "png", "webp"]);

/** Quote history for the account page, newest first. */
export async function getQuoteRequests(userId: string): Promise<QuoteRequestSummary[]> {
  if (!Types.ObjectId.isValid(userId)) return [];
  await connectToDatabase();

  const docs = await QuoteRequest.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate<{ product: { slug: string; name: LocalizedString } | null }>("product", "slug name")
    .lean();

  return docs.map((doc) => ({
    id: String(doc._id),
    status: (doc.status ?? "new") as QuoteRequestSummary["status"],
    createdAt: (doc.createdAt instanceof Date
      ? doc.createdAt
      : new Date(String(doc.createdAt))
    ).toISOString(),
    message: doc.message ?? undefined,
    attachments: (doc.attachments ?? []).map((a) => ({
      url: a.url,
      bytes: a.bytes,
      format: a.format,
      originalName: a.originalName,
      isImage: IMAGE_FORMATS.has(a.format.toLowerCase()),
    })),
    product: doc.product
      ? { slug: doc.product.slug, name: doc.product.name }
      : null,
  }));
}
