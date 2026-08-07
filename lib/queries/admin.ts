import { Types } from "mongoose";

import { connectToDatabase } from "../db";
import { MediaAsset } from "../models/media-asset";
import { Product } from "../models/product";
import { QuoteRequest } from "../models/quote-request";
import { User } from "../models/user";

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
