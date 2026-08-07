import { Types } from "mongoose";

import { connectToDatabase } from "../db";
import { Brand } from "../models/brand";
import { Category } from "../models/category";
import { MediaAsset } from "../models/media-asset";
import { Product } from "../models/product";
import { QuoteRequest } from "../models/quote-request";
import { User } from "../models/user";
import type { LocalizedString, SpecDefinition } from "../types";
import { getAllCategories, getEffectiveSpecSchema } from "./categories";

export type AdminCounts = {
  users: number;
  admins: number;
  quotes: number;
  newQuotes: number;
  media: number;
  mediaBytes: number;
  attachments: number;
  products: number;
};

export async function getAdminCounts(): Promise<AdminCounts> {
  await connectToDatabase();

  const [users, admins, quotes, newQuotes, media, products, mediaSize, attachmentCount] =
    await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ role: "admin" }),
      QuoteRequest.countDocuments({}),
      QuoteRequest.countDocuments({ status: "new" }),
      MediaAsset.countDocuments({}),
      Product.countDocuments({ isActive: true }),
      MediaAsset.aggregate<{ total: number }>([
        { $group: { _id: null, total: { $sum: "$bytes" } } },
      ]),
      // Attachments live inside quote documents, so counting them means
      // unwinding rather than a collection count.
      QuoteRequest.aggregate<{ n: number }>([
        { $unwind: "$attachments" },
        { $count: "n" },
      ]),
    ]);

  return {
    users,
    admins,
    quotes,
    newQuotes,
    media,
    mediaBytes: mediaSize[0]?.total ?? 0,
    attachments: attachmentCount[0]?.n ?? 0,
    products,
  };
}

export type AdminUserRow = {
  id: string;
  email: string;
  name: string;
  phone?: string;
  company?: string;
  role: "customer" | "admin";
  savedProducts: number;
  quoteCount: number;
  lastLoginAt: string | null;
  createdAt: string;
};

/**
 * Users with their enquiry counts, newest first.
 *
 * The quote counts come from one grouped aggregation rather than a query per
 * row — a hundred users would otherwise be a hundred round trips.
 */
export async function listUsers(search?: string): Promise<AdminUserRow[]> {
  await connectToDatabase();

  const filter: Record<string, unknown> = {};
  const term = search?.trim();
  if (term) {
    // Escaped: a user typing "a+b" must not be interpreted as a pattern.
    const rx = { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    filter.$or = [{ email: rx }, { name: rx }, { company: rx }];
  }

  const [docs, quoteCounts] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).limit(200).lean(),
    QuoteRequest.aggregate<{ _id: Types.ObjectId | null; n: number }>([
      { $match: { user: { $ne: null } } },
      { $group: { _id: "$user", n: { $sum: 1 } } },
    ]),
  ]);

  const byUser = new Map(quoteCounts.filter((r) => r._id).map((r) => [String(r._id), r.n]));

  return docs.map((doc) => ({
    id: String(doc._id),
    email: doc.email,
    name: doc.name,
    phone: doc.phone ?? undefined,
    company: doc.company ?? undefined,
    role: (doc.role ?? "customer") as AdminUserRow["role"],
    savedProducts: doc.savedProducts?.length ?? 0,
    quoteCount: byUser.get(String(doc._id)) ?? 0,
    lastLoginAt: doc.lastLoginAt ? new Date(doc.lastLoginAt).toISOString() : null,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : "",
  }));
}

export type MediaRow = {
  id: string;
  publicId: string;
  url: string;
  resourceType: string;
  format: string;
  bytes: number;
  width?: number;
  height?: number;
  title: string;
  originalName: string;
  isImage: boolean;
  createdAt: string;
};

const IMAGE_FORMATS = new Set(["jpg", "jpeg", "png", "webp"]);

export async function listMedia(search?: string): Promise<MediaRow[]> {
  await connectToDatabase();

  const filter: Record<string, unknown> = {};
  const term = search?.trim();
  if (term) {
    const rx = { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    filter.$or = [{ title: rx }, { originalName: rx }];
  }

  const docs = await MediaAsset.find(filter).sort({ createdAt: -1 }).limit(200).lean();

  return docs.map((doc) => ({
    id: String(doc._id),
    publicId: doc.publicId,
    url: doc.url,
    resourceType: doc.resourceType,
    format: doc.format,
    bytes: doc.bytes,
    width: doc.width ?? undefined,
    height: doc.height ?? undefined,
    title: doc.title,
    originalName: doc.originalName,
    isImage: IMAGE_FORMATS.has(doc.format.toLowerCase()),
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : "",
  }));
}

export type AdminProductRow = {
  id: string;
  sku: string;
  slug: string;
  name: LocalizedString;
  brandName: string;
  categoryName: LocalizedString;
  price: number;
  salePrice: number | null;
  stock: number;
  stockStatus: string;
  isActive: boolean;
  isFeatured: boolean;
  images: number;
  /** Locales whose name or descriptions are still blank. */
  missingLocales: string[];
  quoteCount: number;
};

/**
 * Products for the admin table, including inactive ones — the storefront hides
 * those, which is exactly why the panel must show them.
 */
export async function listAdminProducts(search?: string): Promise<AdminProductRow[]> {
  await connectToDatabase();

  const filter: Record<string, unknown> = {};
  const term = search?.trim();
  if (term) {
    const rx = { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    filter.$or = [{ sku: rx }, { slug: rx }, { "name.ka": rx }, { "name.en": rx }, { "name.ru": rx }];
  }

  const [docs, brands, categories, quoteCounts] = await Promise.all([
    Product.find(filter).sort({ updatedAt: -1 }).limit(300).lean(),
    Brand.find({}).select("name").lean(),
    Category.find({}).select("name").lean(),
    QuoteRequest.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $group: { _id: "$product", n: { $sum: 1 } } },
    ]),
  ]);

  const brandName = new Map(brands.map((b) => [String(b._id), b.name]));
  const categoryName = new Map(categories.map((c) => [String(c._id), c.name]));
  const quotesByProduct = new Map(quoteCounts.map((r) => [String(r._id), r.n]));

  return docs.map((doc) => {
    // Flagged rather than blocked: a product may legitimately ship before its
    // translations are done, but the operator should be able to see which.
    const missingLocales = (["en", "ru"] as const).filter(
      (locale) => !doc.name?.[locale] || !doc.shortDescription?.[locale],
    );

    return {
      id: String(doc._id),
      sku: doc.sku,
      slug: doc.slug,
      name: {
        ka: doc.name?.ka ?? "",
        en: doc.name?.en ?? undefined,
        ru: doc.name?.ru ?? undefined,
      },
      brandName: brandName.get(String(doc.brand)) ?? "—",
      categoryName: {
        ka: categoryName.get(String(doc.category))?.ka ?? "—",
        en: categoryName.get(String(doc.category))?.en ?? undefined,
        ru: categoryName.get(String(doc.category))?.ru ?? undefined,
      },
      price: doc.price,
      salePrice: doc.salePrice ?? null,
      stock: doc.stock ?? 0,
      stockStatus: doc.stockStatus ?? "out",
      isActive: doc.isActive ?? true,
      isFeatured: doc.isFeatured ?? false,
      images: doc.images?.length ?? 0,
      missingLocales,
      quoteCount: quotesByProduct.get(String(doc._id)) ?? 0,
    };
  });
}

export type AdminProductDetail = {
  id: string;
  sku: string;
  slug: string;
  name: LocalizedString;
  shortDescription: LocalizedString;
  description: LocalizedString;
  brandId: string;
  categoryId: string;
  price: number;
  salePrice: number | null;
  stock: number;
  stockStatus: string;
  isActive: boolean;
  isFeatured: boolean;
  images: { url: string; alt: LocalizedString }[];
  specs: Record<string, string | number | boolean>;
};

export async function getAdminProduct(id: string): Promise<AdminProductDetail | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  await connectToDatabase();

  const doc = await Product.findById(id).lean();
  if (!doc) return null;

  const specs: Record<string, string | number | boolean> = {};
  for (const spec of doc.specs ?? []) {
    if (spec.valueNumber !== undefined && spec.valueNumber !== null) specs[spec.key] = spec.valueNumber;
    else if (spec.valueString) specs[spec.key] = spec.valueString;
    else if (spec.valueBool !== undefined && spec.valueBool !== null) specs[spec.key] = spec.valueBool;
  }

  const localized = (value: { ka?: string | null; en?: string | null; ru?: string | null } | null | undefined) => ({
    ka: value?.ka ?? "",
    en: value?.en ?? undefined,
    ru: value?.ru ?? undefined,
  });

  return {
    id: String(doc._id),
    sku: doc.sku,
    slug: doc.slug,
    name: localized(doc.name),
    shortDescription: localized(doc.shortDescription),
    description: localized(doc.description),
    brandId: String(doc.brand),
    categoryId: String(doc.category),
    price: doc.price,
    salePrice: doc.salePrice ?? null,
    stock: doc.stock ?? 0,
    stockStatus: doc.stockStatus ?? "out",
    isActive: doc.isActive ?? true,
    isFeatured: doc.isFeatured ?? false,
    images: (doc.images ?? []).map((image) => ({ url: image.url, alt: localized(image.alt) })),
    specs,
  };
}

export type ProductFormOptions = {
  brands: { id: string; name: string }[];
  /** Leaf-first list with the full path, so the picker is unambiguous. */
  categories: { id: string; label: string; specSchema: SpecDefinition[] }[];
  media: { id: string; url: string; title: string; isImage: boolean }[];
};

/**
 * Everything the form needs to render its selects, in one read.
 *
 * The effective spec schema travels with each category so changing the category
 * re-renders the spec inputs without another round trip.
 */
export async function getProductFormOptions(): Promise<ProductFormOptions> {
  await connectToDatabase();

  const [brands, categories, media] = await Promise.all([
    Brand.find({}).sort({ order: 1 }).select("name").lean(),
    getAllCategories(),
    MediaAsset.find({}).sort({ createdAt: -1 }).limit(200).lean(),
  ]);

  const byId = new Map(categories.map((c) => [c.id, c]));
  const pathLabel = (category: (typeof categories)[number]) =>
    [...category.ancestors.map((id) => byId.get(id)?.name.en ?? byId.get(id)?.name.ka ?? "?"), category.name.en ?? category.name.ka]
      .filter(Boolean)
      .join(" › ");

  const withSchema = await Promise.all(
    categories.map(async (category) => ({
      id: category.id,
      label: pathLabel(category),
      specSchema: await getEffectiveSpecSchema(category),
    })),
  );

  return {
    brands: brands.map((b) => ({ id: String(b._id), name: b.name })),
    categories: withSchema.sort((a, b) => a.label.localeCompare(b.label)),
    media: media.map((m) => ({
      id: String(m._id),
      url: m.url,
      title: m.title,
      isImage: IMAGE_FORMATS.has(m.format.toLowerCase()),
    })),
  };
}

export type AttachmentRow = {
  quoteId: string;
  publicId: string;
  url: string;
  originalName: string;
  bytes: number;
  format: string;
  isImage: boolean;
  quote: {
    status: string;
    email: string;
    name: string;
    createdAt: string;
    productSlug: string | null;
  };
};

/**
 * Every file customers have attached, flattened out of the enquiries.
 *
 * Read-only apart from delete: an attachment is evidence attached to one
 * enquiry, so replacing it would misrepresent what was actually sent.
 */
export async function listAttachments(): Promise<AttachmentRow[]> {
  await connectToDatabase();

  const docs = await QuoteRequest.find({ "attachments.0": { $exists: true } })
    .sort({ createdAt: -1 })
    .limit(200)
    .populate<{ product: { slug: string } | null }>("product", "slug")
    .lean();

  return docs.flatMap((doc) =>
    (doc.attachments ?? []).map((file) => ({
      quoteId: String(doc._id),
      publicId: file.publicId,
      url: file.url,
      originalName: file.originalName,
      bytes: file.bytes,
      format: file.format,
      isImage: IMAGE_FORMATS.has(file.format.toLowerCase()),
      quote: {
        status: doc.status ?? "new",
        email: doc.email,
        name: doc.name,
        createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : "",
        productSlug: doc.product?.slug ?? null,
      },
    })),
  );
}
