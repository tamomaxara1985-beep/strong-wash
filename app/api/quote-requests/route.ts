import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, notFoundJson, validationError } from "@/lib/api";
import { assertSameOrigin } from "@/lib/auth/guard";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import { fieldErrors, quoteRequestSchema } from "@/lib/auth/schemas";
import { getSession } from "@/lib/auth/session";
import {
  CloudinaryNotConfiguredError,
  UnreadableFileError,
  deleteAttachments,
  uploadAttachment,
  type StoredAttachment,
} from "@/lib/cloudinary";
import { connectToDatabase } from "@/lib/db";
import { Product } from "@/lib/models/product";
import { QuoteRequest } from "@/lib/models/quote-request";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/types";
import {
  MAX_FILES,
  MAX_FILE_BYTES,
  isRejection,
  safeDisplayName,
  validateUpload,
} from "@/lib/uploads";

/**
 * Enquiries are bursty by nature — someone shortlisting three gantries sends
 * three — and a customer's staff share one office IP behind NAT. 20 an hour
 * still stops a script while leaving real comparison shopping alone. Matches the
 * sign-up route's reasoning.
 */
const MAX_PER_IP = 20;
const WINDOW_MS = 60 * 60 * 1000;

/** Total body ceiling: the per-file cap times the file limit, plus text fields. */
const MAX_BODY_BYTES = MAX_FILES * MAX_FILE_BYTES + 64 * 1024;

/**
 * The v1 conversion event, with optional attachments.
 *
 * Files ride along with the enquiry rather than going through a separate upload
 * endpoint. That means nothing is stored until the request itself validates, so
 * an abandoned form leaves no orphaned files behind, and there is no
 * unauthenticated upload endpoint sitting there to be filled with junk.
 *
 * Open to signed-out visitors on purpose — requiring an account before a sales
 * enquiry would cost leads — with the session attached when there is one, which
 * is what gives an account its quote history.
 */
export async function POST(request: NextRequest) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const limited = rateLimit(`quote:${clientIp(request)}`, MAX_PER_IP, WINDOW_MS);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
    );
  }

  // Reject an oversized body on the declared length before reading it, so a
  // deliberate 500 MB post does not get buffered first.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "payload_too_large", maxBytes: MAX_FILE_BYTES, maxFiles: MAX_FILES },
      { status: 413 },
    );
  }

  const stored: StoredAttachment[] = [];

  try {
    const contentType = request.headers.get("content-type") ?? "";
    const isMultipart = contentType.includes("multipart/form-data");

    let payload: Record<string, unknown>;
    let files: File[] = [];

    if (isMultipart) {
      const form = await request.formData();
      payload = {
        productSlug: String(form.get("productSlug") ?? ""),
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        phone: String(form.get("phone") ?? ""),
        company: String(form.get("company") ?? ""),
        message: String(form.get("message") ?? ""),
      };
      payload.locale = String(form.get("locale") ?? "");
      files = form.getAll("attachments").filter((v): v is File => v instanceof File && v.size > 0);
    } else {
      payload = await request.json();
    }

    const parsed = quoteRequestSchema.safeParse(payload);
    if (!parsed.success) return validationError(fieldErrors(parsed.error));

    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: "too_many_files", maxFiles: MAX_FILES },
        { status: 422 },
      );
    }

    const localeRaw = typeof payload.locale === "string" ? payload.locale : "";
    const locale: Locale = LOCALES.includes(localeRaw as Locale)
      ? (localeRaw as Locale)
      : DEFAULT_LOCALE;

    await connectToDatabase();
    const product = await Product.findOne({ slug: parsed.data.productSlug, isActive: true })
      .select("_id slug")
      .lean();
    if (!product) return notFoundJson("product");

    // Validate every file before uploading any, so a rejected second file does
    // not leave the first one stored.
    const validated = [];
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = validateUpload(buffer);
      if (isRejection(result)) {
        return NextResponse.json(
          {
            error: "file_rejected",
            reason: result.code,
            fileName: safeDisplayName(file.name, "bin"),
            maxBytes: MAX_FILE_BYTES,
          },
          { status: 422 },
        );
      }
      validated.push({ file: result, originalName: safeDisplayName(file.name, result.extension) });
    }

    for (const item of validated) {
      stored.push(
        await uploadAttachment(item.file, {
          folder: `strongwash/quote-requests/${product.slug}`,
          originalName: item.originalName,
        }),
      );
    }

    const session = await getSession();

    const created = await QuoteRequest.create({
      user: session?.userId ?? null,
      product: product._id,
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone || undefined,
      company: parsed.data.company || undefined,
      message: parsed.data.message || undefined,
      attachments: stored,
      locale,
      status: "new",
    });

    return NextResponse.json(
      { id: created._id.toString(), attachments: stored.length },
      { status: 201 },
    );
  } catch (error) {
    // Anything stored before the failure is now unreferenced, so remove it.
    await deleteAttachments(
      stored.map((a) => ({ publicId: a.publicId, resourceType: a.resourceType })),
    );

    if (error instanceof CloudinaryNotConfiguredError) {
      return NextResponse.json(
        { error: "uploads_not_configured", message: error.message },
        { status: 503 },
      );
    }
    if (error instanceof UnreadableFileError) {
      // Correct headers, undecodable contents: the sender has to fix the file.
      return NextResponse.json(
        { error: "file_rejected", reason: "unreadable" },
        { status: 422 },
      );
    }
    return apiError(error);
  }
}
