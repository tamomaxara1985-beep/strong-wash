import { v2 as cloudinary } from "cloudinary";

import { MAX_FILE_BYTES, type ValidatedUpload } from "./uploads";

/**
 * Server-side Cloudinary client.
 *
 * The API secret must never reach the browser, which is why none of these
 * variables carry the `NEXT_PUBLIC_` prefix and why uploads are proxied through
 * a route handler rather than signed for direct browser upload. A signed direct
 * upload would be cheaper on our bandwidth, but the signature would have to
 * delegate the size and type limits to Cloudinary's own enforcement — this way
 * the bytes are inspected before anything is stored.
 */

/**
 * The file passed our checks but Cloudinary could not decode it.
 *
 * Magic bytes prove the container, not that the payload is intact: a truncated
 * upload or a hand-crafted header still starts with the right eight bytes. That
 * is the caller's problem to report, not a server fault, so it is a distinct
 * error type rather than a generic failure.
 */
export class UnreadableFileError extends Error {
  constructor(detail: string) {
    super(`Storage rejected the file: ${detail}`);
    this.name = "UnreadableFileError";
  }
}

export class CloudinaryNotConfiguredError extends Error {
  constructor() {
    super(
      "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY " +
        "and CLOUDINARY_API_SECRET in .env.local (see .env.example).",
    );
    this.name = "CloudinaryNotConfiguredError";
  }
}

let configured = false;

function configure() {
  if (configured) return;

  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud_name || !api_key || !api_secret) throw new CloudinaryNotConfiguredError();

  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  configured = true;
}

export type StoredAttachment = {
  url: string;
  publicId: string;
  /**
   * The concrete type Cloudinary filed this under — "image", "raw", "video".
   *
   * Required for deletion: uploads accept `resource_type: "auto"`, but `destroy`
   * rejects it ("Must be one of: image, javascript, css, video, raw"), so a
   * delete that assumed "auto" failed silently and left the file behind. The
   * value therefore has to be persisted, not guessed from the format.
   */
  resourceType: string;
  bytes: number;
  format: string;
  width?: number;
  height?: number;
  originalName: string;
};

/**
 * Uploads one already-validated file.
 *
 * `resource_type: "auto"` lets Cloudinary route PDFs and images appropriately.
 * The size limit is passed again here as a server-side backstop: the buffer was
 * already checked, but a limit expressed at the storage boundary too means a
 * future caller that forgets `validateUpload` still cannot store 50 MB.
 */
export async function uploadAttachment(
  file: ValidatedUpload,
  options: { folder: string; originalName: string },
): Promise<StoredAttachment> {
  configure();

  const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder,
        resource_type: "auto",
        // Cloudinary generates the public id; the client filename is never used
        // as a storage key.
        use_filename: false,
        unique_filename: true,
        overwrite: false,
        bytes_limit: MAX_FILE_BYTES,
      },
      (error, uploaded) => {
        if (error) {
          // A 4xx from Cloudinary means it rejected this file, not that the
          // service failed — surface it as a client error so the form can say
          // something useful instead of showing "something went wrong".
          const status = Number((error as { http_code?: number }).http_code ?? 0);
          const message = String((error as { message?: string }).message ?? "unknown");
          reject(
            status >= 400 && status < 500 ? new UnreadableFileError(message) : error,
          );
        } else if (!uploaded) reject(new Error("Cloudinary returned no result"));
        else resolve(uploaded as unknown as Record<string, unknown>);
      },
    );
    stream.end(file.bytes);
  });

  return {
    url: String(result.secure_url ?? result.url ?? ""),
    publicId: String(result.public_id ?? ""),
    resourceType: String(result.resource_type ?? "image"),
    bytes: Number(result.bytes ?? file.size),
    format: String(result.format ?? file.extension),
    width: typeof result.width === "number" ? result.width : undefined,
    height: typeof result.height === "number" ? result.height : undefined,
    originalName: options.originalName,
  };
}

/**
 * Best-effort cleanup, used when a later step of the same request fails.
 *
 * Swallows its own errors on purpose: the caller is already handling a failure,
 * and a botched cleanup must not replace the original error with a confusing
 * one. Worst case a file is stored that nothing references.
 */
export async function deleteAttachments(
  files: { publicId: string; resourceType: string }[],
): Promise<void> {
  if (!files.length) return;
  try {
    configure();
    const results = await Promise.all(
      files.map((file) =>
        cloudinary.uploader
          .destroy(file.publicId, { resource_type: file.resourceType, invalidate: true })
          .then((res) => ({ id: file.publicId, result: res?.result })),
      ),
    );
    // Logged rather than assumed: "not found" and "ok" both come back 200, and a
    // silent no-op is exactly the failure this signature was changed to fix.
    const missed = results.filter((r) => r.result !== "ok");
    if (missed.length) console.warn("[cloudinary] not deleted:", missed);
  } catch (error) {
    console.error("[cloudinary] cleanup failed", error);
  }
}
