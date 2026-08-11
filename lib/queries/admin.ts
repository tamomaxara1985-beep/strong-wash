import { Types } from "mongoose";

import { connectToDatabase } from "../db";
import { Brand } from "../models/brand";
import { Category } from "../models/category";
import { ContactMessage } from "../models/contact-message";
import { HeroSlide } from "../models/hero-slide";
import { MediaAsset } from "../models/media-asset";
import { Product } from "../models/product";
import { QuoteRequest } from "../models/quote-request";
import { StoreLocation } from "../models/store-location";
import { User } from "../models/user";
import type { LocalizedString, SpecDefinition } from "../types";
import { getAllCategories, getEffectiveSpecSchema } from "./categories";

export type AdminCounts = {
  users: number;
  admins: number;
  quotes: number;
  newQuotes: number;
  messages: number;
  newMessages: number;
  media: number;
  mediaBytes: number;
  attachments: number;
  products: number;
};

export async function getAdminCounts(): Promise<AdminCounts> {
  await connectToDatabase();

  const [users, admins, quotes, newQuotes, messages, newMessages, media, products, mediaSize, attachmentCount] =
    await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ role: "admin" }),
      QuoteRequest.countDocuments({}),
      QuoteRequest.countDocuments({ status: "new" }),
      ContactMessage.countDocuments({}),
      ContactMessage.countDocuments({ status: "new" }),
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
    messages,
    newMessages,
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

export type AdminCategoryRow = {
  id: string;
  slug: string;
  path: string;
  name: LocalizedString;
  description?: LocalizedString;
  parentId: string | null;
  icon?: string;
  order: number;
  isActive: boolean;
  /** Nesting level, for indenting the tree. */
  depth: number;
  children: number;
  /** Filed directly here. */
  ownProducts: number;
  /** Including every descendant — what the storefront count shows. */
  subtreeProducts: number;
  specCount: number;
  missingLocales: string[];
};

/**
 * The tree, flattened depth-first so it renders as an indented list in one pass.
 *
 * Includes inactive categories: the storefront hides them, which is exactly why
 * the panel has to show them.
 */
export async function listAdminCategories(): Promise<AdminCategoryRow[]> {
  await connectToDatabase();

  const [docs, ownCounts, subtreeCounts] = await Promise.all([
    Category.find({}).sort({ order: 1 }).lean(),
    Product.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $group: { _id: "$category", n: { $sum: 1 } } },
    ]),
    Product.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $unwind: "$categoryAncestors" },
      { $group: { _id: "$categoryAncestors", n: { $sum: 1 } } },
    ]),
  ]);

  const own = new Map(ownCounts.map((r) => [String(r._id), r.n]));
  const subtree = new Map(subtreeCounts.map((r) => [String(r._id), r.n]));
  const childCount = new Map<string, number>();
  for (const doc of docs) {
    if (doc.parent) {
      const key = String(doc.parent);
      childCount.set(key, (childCount.get(key) ?? 0) + 1);
    }
  }

  const byParent = new Map<string, typeof docs>();
  for (const doc of docs) {
    const key = doc.parent ? String(doc.parent) : "root";
    byParent.set(key, [...(byParent.get(key) ?? []), doc]);
  }

  const rows: AdminCategoryRow[] = [];
  const walk = (parentKey: string, depth: number) => {
    for (const doc of (byParent.get(parentKey) ?? []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
      const id = String(doc._id);
      rows.push({
        id,
        slug: doc.slug,
        path: doc.path,
        name: {
          ka: doc.name?.ka ?? "",
          en: doc.name?.en ?? undefined,
          ru: doc.name?.ru ?? undefined,
        },
        description: doc.description?.ka
          ? {
              ka: doc.description.ka,
              en: doc.description.en ?? undefined,
              ru: doc.description.ru ?? undefined,
            }
          : undefined,
        parentId: doc.parent ? String(doc.parent) : null,
        icon: doc.icon ?? undefined,
        order: doc.order ?? 0,
        isActive: doc.isActive ?? true,
        depth,
        children: childCount.get(id) ?? 0,
        ownProducts: own.get(id) ?? 0,
        subtreeProducts: subtree.get(id) ?? 0,
        specCount: doc.specSchema?.length ?? 0,
        missingLocales: (["en", "ru"] as const).filter((locale) => !doc.name?.[locale]),
      });
      walk(id, depth + 1);
    }
  };
  walk("root", 0);

  return rows;
}

export async function getAdminCategory(id: string): Promise<AdminCategoryRow | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  const all = await listAdminCategories();
  return all.find((row) => row.id === id) ?? null;
}

export type AdminBrandRow = {
  id: string;
  slug: string;
  name: string;
  description?: LocalizedString;
  order: number;
  isActive: boolean;
  /** Products assigned to this brand, active or not — the delete guard's number. */
  productCount: number;
};

/**
 * Every brand with its product count.
 *
 * Includes inactive brands: the storefront hides them, which is exactly why the
 * panel has to show them.
 */
export async function listAdminBrands(): Promise<AdminBrandRow[]> {
  await connectToDatabase();

  const [docs, counts] = await Promise.all([
    Brand.find({}).sort({ order: 1 }).lean(),
    Product.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $group: { _id: "$brand", n: { $sum: 1 } } },
    ]),
  ]);

  const byBrand = new Map(counts.map((row) => [String(row._id), row.n]));

  return docs
    .map((doc) => {
      const id = String(doc._id);
      return {
        id,
        slug: doc.slug,
        name: doc.name,
        description: doc.description?.ka
          ? {
              ka: doc.description.ka,
              en: doc.description.en ?? undefined,
              ru: doc.description.ru ?? undefined,
            }
          : undefined,
        order: doc.order ?? 0,
        isActive: doc.isActive ?? true,
        productCount: byBrand.get(id) ?? 0,
      };
    })
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export async function getAdminBrand(id: string): Promise<AdminBrandRow | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  const all = await listAdminBrands();
  return all.find((row) => row.id === id) ?? null;
}

export type AdminSlideRow = {
  id: string;
  image: string;
  alt: LocalizedString;
  href?: string;
  width?: number;
  height?: number;
  order: number;
  isActive: boolean;
};

/**
 * Every slide, inactive ones included: the storefront hides those, which is
 * exactly why the panel has to show them.
 */
export async function listAdminSlides(): Promise<AdminSlideRow[]> {
  await connectToDatabase();
  const docs = await HeroSlide.find({}).sort({ order: 1 }).lean();

  return docs.map((doc) => ({
    id: String(doc._id),
    image: doc.image,
    alt: {
      ka: doc.alt?.ka ?? "",
      en: doc.alt?.en ?? undefined,
      ru: doc.alt?.ru ?? undefined,
    },
    href: doc.href?.trim() || undefined,
    width: doc.width ?? undefined,
    height: doc.height ?? undefined,
    order: doc.order ?? 0,
    isActive: doc.isActive ?? true,
  }));
}

export async function getAdminSlide(id: string): Promise<AdminSlideRow | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  const all = await listAdminSlides();
  return all.find((row) => row.id === id) ?? null;
}

/**
 * Images the slide form can choose from.
 *
 * Separate from `getProductFormOptions` because a slide needs the intrinsic
 * dimensions, which the product picker does not carry, and needs none of the
 * categories or spec schemas that make that read expensive.
 */
export async function getSlideFormOptions(): Promise<{
  media: { id: string; url: string; title: string; width?: number; height?: number }[];
}> {
  await connectToDatabase();
  const assets = await MediaAsset.find({ resourceType: "image" })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  return {
    media: assets.map((asset) => ({
      id: String(asset._id),
      url: asset.url,
      title: asset.title,
      width: asset.width ?? undefined,
      height: asset.height ?? undefined,
    })),
  };
}

export type AdminLocationRow = {
  id: string;
  name: LocalizedString;
  phone: string;
  phone2?: string;
  email?: string;
  address: LocalizedString;
  workHours: LocalizedString;
  mapUrl?: string;
  order: number;
  isActive: boolean;
};

/**
 * Every branch, inactive ones included: the storefront hides those, which is
 * exactly why the panel has to show them.
 */
export async function listAdminLocations(): Promise<AdminLocationRow[]> {
  await connectToDatabase();
  const docs = await StoreLocation.find({}).sort({ order: 1 }).lean();

  return docs.map((doc) => ({
    id: String(doc._id),
    name: {
      ka: doc.name?.ka ?? "",
      en: doc.name?.en ?? undefined,
      ru: doc.name?.ru ?? undefined,
    },
    phone: doc.phone,
    phone2: doc.phone2?.trim() || undefined,
    email: doc.email?.trim() || undefined,
    address: {
      ka: doc.address?.ka ?? "",
      en: doc.address?.en ?? undefined,
      ru: doc.address?.ru ?? undefined,
    },
    workHours: {
      ka: doc.workHours?.ka ?? "",
      en: doc.workHours?.en ?? undefined,
      ru: doc.workHours?.ru ?? undefined,
    },
    mapUrl: doc.mapUrl?.trim() || undefined,
    order: doc.order ?? 0,
    isActive: doc.isActive ?? true,
  }));
}

export async function getAdminLocation(id: string): Promise<AdminLocationRow | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  const all = await listAdminLocations();
  return all.find((row) => row.id === id) ?? null;
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
  /**
   * Every brand, hidden ones included. Filtering to active would leave a product
   * on a hidden brand with no matching option, and the select would silently
   * reassign it on the next save.
   */
  brands: { id: string; name: string; isActive: boolean }[];
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
    Brand.find({}).sort({ order: 1 }).select("name isActive").lean(),
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
    brands: brands.map((b) => ({ id: String(b._id), name: b.name, isActive: b.isActive ?? true })),
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

export type AdminMessageRow = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  locale: string;
  status: "new" | "handled";
  createdAt: string;
};

type LeanContactMessage = {
  _id: unknown;
  name: string;
  email: string;
  phone?: string | null;
  subject: string;
  message: string;
  locale?: string | null;
  status?: string | null;
  createdAt?: Date | string;
};

function toMessageRow(doc: LeanContactMessage): AdminMessageRow {
  return {
    id: String(doc._id),
    name: doc.name,
    email: doc.email,
    phone: doc.phone?.trim() || undefined,
    subject: doc.subject,
    message: doc.message,
    locale: doc.locale || "",
    // Normalised rather than cast: a legacy row carrying anything other than
    // "handled" belongs in the unread pile, and casting would badge it wrongly.
    status: doc.status === "handled" ? "handled" : "new",
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : "",
  };
}

/**
 * Every message, unread first and newest first within each group.
 *
 * Ordered that way rather than purely by date because the reason to open this
 * screen is to see what has not been answered; a handled message from this
 * morning is not more urgent than an unread one from yesterday.
 *
 * Two capped queries rather than one, because the cap must not be able to
 * hide unread mail: with a single `limit(200)` an unanswered message older
 * than the newest 200 becomes unreachable, and this list is the only route to
 * the detail page. This is also the one collection an anonymous visitor can
 * grow, so the cap is load-bearing rather than theoretical. The split is
 * `$ne: "handled"` rather than `status: "new"` so it agrees with `toMessageRow`'s
 * normalisation: an unrecognised status must be treated as unanswered, because a
 * message wrongly badged handled is silently lost mail, whereas one wrongly
 * badged unread costs an operator a single redundant open.
 */
export async function listAdminMessages(): Promise<AdminMessageRow[]> {
  await connectToDatabase();

  const [unread, handled] = await Promise.all([
    ContactMessage.find({ status: { $ne: "handled" } }).sort({ createdAt: -1 }).limit(200).lean(),
    ContactMessage.find({ status: "handled" }).sort({ createdAt: -1 }).limit(200).lean(),
  ]);

  return [...unread, ...handled].map(toMessageRow);
}

export async function getAdminMessage(id: string): Promise<AdminMessageRow | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  await connectToDatabase();

  const doc = await ContactMessage.findById(id).lean();
  if (!doc) return null;

  return toMessageRow(doc);
}
