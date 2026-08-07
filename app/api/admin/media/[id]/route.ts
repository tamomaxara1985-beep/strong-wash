import { Types } from "mongoose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, notFoundJson, validationError } from "@/lib/api";
import { assertSameOrigin, requireAdmin } from "@/lib/auth/guard";
import {
  MEDIA_FOLDER,
  UnreadableFileError,
  deleteAttachments,
  renameAsset,
  uploadAttachment,
} from "@/lib/cloudinary";
import { connectToDatabase } from "@/lib/db";
import { MediaAsset } from "@/lib/models/media-asset";
import {
  MAX_FILE_BYTES,
  isRejection,
  safeDisplayName,
  validateUpload,
} from "@/lib/uploads";

/** Public ids are path segments in the delivery URL, so the slug has to be tame. */
function slugifyTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "asset"
  );
}

/**
 * Rename (title) and/or replace (new file) one asset.
 *
 * Rename moves the stored object as well, because Cloudinary's public id *is* the
 * URL path — leaving it would give a file called "gantry" a URL ending in
 * "screenshot-2026". The returned URL is persisted, since it changes.
 */
export async function PATCH(request: NextRequest, context: RouteContext<"/api/admin/media/[id]">) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) return notFoundJson("media");

    await connectToDatabase();
    const asset = await MediaAsset.findById(id);
    if (!asset) return notFoundJson("media");

    const contentType = request.headers.get("content-type") ?? "";
    let title: string | undefined;
    let replacement: File | undefined;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const rawTitle = form.get("title");
      if (typeof rawTitle === "string") title = rawTitle.trim();
      const file = form.get("file");
      if (file instanceof File && file.size > 0) replacement = file;
    } else {
      const body = (await request.json()) as { title?: unknown };
      if (typeof body.title === "string") title = body.title.trim();
    }

    if (title !== undefined && (title.length < 1 || title.length > 120)) {
      return validationError({ title: "length" });
    }

    // Replace first: if the upload fails, the title stays as it was.
    if (replacement) {
      const buffer = Buffer.from(await replacement.arrayBuffer());
      const result = validateUpload(buffer);
      if (isRejection(result)) {
        return NextResponse.json(
          { error: "file_rejected", reason: result.code, maxBytes: MAX_FILE_BYTES },
          { status: 422 },
        );
      }

      const uploaded = await uploadAttachment(result, {
        folder: MEDIA_FOLDER,
        originalName: safeDisplayName(replacement.name, result.extension),
      });

      // The old object is removed only once the new one is safely stored.
      const previous = { publicId: asset.publicId, resourceType: asset.resourceType };
      asset.publicId = uploaded.publicId;
      asset.url = uploaded.url;
      asset.resourceType = uploaded.resourceType;
      asset.bytes = uploaded.bytes;
      asset.format = uploaded.format;
      asset.width = uploaded.width;
      asset.height = uploaded.height;
      asset.originalName = uploaded.originalName;
      await asset.save();
      await deleteAttachments([previous]);
    }

    if (title !== undefined && title !== asset.title) {
      const target = `${MEDIA_FOLDER}/${slugifyTitle(title)}`;
      if (target !== asset.publicId) {
        const renamed = await renameAsset(asset.publicId, target, asset.resourceType);
        // A clash means the storage name is taken; the title still changes, the
        // URL simply keeps its old path. Better than failing the whole edit.
        if (renamed) {
          asset.publicId = renamed.publicId;
          asset.url = renamed.url;
        }
      }
      asset.title = title;
      await asset.save();
    }

    return NextResponse.json({
      asset: {
        id: String(asset._id),
        title: asset.title,
        url: asset.url,
        publicId: asset.publicId,
        bytes: asset.bytes,
        format: asset.format,
      },
    });
  } catch (error) {
    if (error instanceof UnreadableFileError) {
      return NextResponse.json({ error: "file_rejected", reason: "unreadable" }, { status: 422 });
    }
    return apiError(error);
  }
}

/** Removes the row and the stored file. */
export async function DELETE(request: NextRequest, context: RouteContext<"/api/admin/media/[id]">) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) return notFoundJson("media");

    await connectToDatabase();
    const asset = await MediaAsset.findById(id);
    if (!asset) return notFoundJson("media");

    // Storage first: if it fails the row survives and the file stays reachable,
    // which is recoverable. The reverse would leave a file nothing points at.
    await deleteAttachments([{ publicId: asset.publicId, resourceType: asset.resourceType }]);
    await asset.deleteOne();

    return NextResponse.json({ deleted: id });
  } catch (error) {
    return apiError(error);
  }
}
