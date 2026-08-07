import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, validationError } from "@/lib/api";
import { assertSameOrigin, requireAdmin } from "@/lib/auth/guard";
import {
  CloudinaryNotConfiguredError,
  MEDIA_FOLDER,
  UnreadableFileError,
  uploadAttachment,
} from "@/lib/cloudinary";
import { connectToDatabase } from "@/lib/db";
import { MediaAsset } from "@/lib/models/media-asset";
import {
  MAX_FILES,
  MAX_FILE_BYTES,
  isRejection,
  safeDisplayName,
  validateUpload,
} from "@/lib/uploads";

const MAX_BODY_BYTES = MAX_FILES * MAX_FILE_BYTES + 64 * 1024;

/**
 * Uploads to the media library.
 *
 * Same 2 MB cap, same byte-level type sniffing as customer attachments — an
 * authenticated admin is not a reason to trust a file, since the account is
 * exactly what a stolen session gives an attacker.
 */
export async function POST(request: NextRequest) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "payload_too_large", maxBytes: MAX_FILE_BYTES, maxFiles: MAX_FILES },
      { status: 413 },
    );
  }

  try {
    const form = await request.formData();
    const files = form.getAll("files").filter((v): v is File => v instanceof File && v.size > 0);
    if (!files.length) return validationError({ files: "required" });
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: "too_many_files", maxFiles: MAX_FILES }, { status: 422 });
    }

    // Validate all before storing any, so a bad second file cannot leave the
    // first one uploaded.
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
      validated.push({ file: result, name: safeDisplayName(file.name, result.extension) });
    }

    await connectToDatabase();

    const created = [];
    for (const item of validated) {
      const stored = await uploadAttachment(item.file, {
        folder: MEDIA_FOLDER,
        originalName: item.name,
      });
      const doc = await MediaAsset.create({
        publicId: stored.publicId,
        url: stored.url,
        resourceType: stored.resourceType,
        bytes: stored.bytes,
        format: stored.format,
        width: stored.width,
        height: stored.height,
        title: item.name,
        originalName: item.name,
        uploadedBy: auth.userId,
      });
      created.push({ id: String(doc._id), url: doc.url, title: doc.title });
    }

    return NextResponse.json({ created }, { status: 201 });
  } catch (error) {
    if (error instanceof CloudinaryNotConfiguredError) {
      return NextResponse.json(
        { error: "uploads_not_configured", message: error.message },
        { status: 503 },
      );
    }
    if (error instanceof UnreadableFileError) {
      return NextResponse.json({ error: "file_rejected", reason: "unreadable" }, { status: 422 });
    }
    return apiError(error);
  }
}
