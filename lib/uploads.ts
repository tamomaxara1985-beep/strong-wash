/**
 * Upload validation. No Cloudinary, no I/O — just the rules, so they can be
 * reasoned about and tested on their own.
 */

/** 2 MB per file, in bytes. */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** Enough for "a photo of each side of the bay" without inviting an album. */
export const MAX_FILES = 3;

export type AllowedKind = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

/**
 * Signatures checked against the file's own first bytes.
 *
 * The browser-reported `type` and the filename extension are both attacker
 * controlled — `payload.php` renamed to `photo.jpg` arrives with whatever
 * `Content-Type` the client feels like claiming. Only the bytes are evidence.
 */
const SIGNATURES: { kind: AllowedKind; extension: string; test: (b: Uint8Array) => boolean }[] = [
  {
    kind: "image/jpeg",
    extension: "jpg",
    test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    kind: "image/png",
    extension: "png",
    test: (b) =>
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    kind: "image/webp",
    extension: "webp",
    // "RIFF" .... "WEBP" — the size field sits between the two markers.
    test: (b) =>
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
  {
    kind: "application/pdf",
    extension: "pdf",
    // "%PDF-"
    test: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d,
  },
];

/** What the file picker advertises. Convenience only — never trusted. */
export const ACCEPT_ATTRIBUTE = ".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf";

export type UploadRejection =
  | { code: "too_large"; bytes: number }
  | { code: "unsupported_type" }
  | { code: "empty" }
  | { code: "too_many"; limit: number };

export type ValidatedUpload = {
  bytes: Buffer;
  kind: AllowedKind;
  extension: string;
  size: number;
};

/**
 * Sniffs the type and enforces the size cap.
 *
 * Order matters: the size check comes first so a 40 MB file is rejected on its
 * length rather than after inspecting content, and the caller has already had to
 * materialise the buffer to get here — see the route for the streaming-level
 * guard that stops a huge body earlier.
 */
export function validateUpload(bytes: Buffer): ValidatedUpload | UploadRejection {
  if (bytes.length === 0) return { code: "empty" };
  if (bytes.length > MAX_FILE_BYTES) return { code: "too_large", bytes: bytes.length };

  const head = new Uint8Array(bytes.subarray(0, 12));
  const match = SIGNATURES.find((s) => s.test(head));
  if (!match) return { code: "unsupported_type" };

  return { bytes, kind: match.kind, extension: match.extension, size: bytes.length };
}

export function isRejection(
  result: ValidatedUpload | UploadRejection,
): result is UploadRejection {
  return "code" in result;
}

/**
 * A display name safe to store and render.
 *
 * The client filename is never used as a storage key — Cloudinary assigns the
 * public id — but it is shown back to the user, so path separators, control
 * characters and unbounded length all have to go.
 */
export function safeDisplayName(name: string, extension: string): string {
  const base = name
    // Control characters, written as escapes so the source holds no invisible
    // bytes. Note a `[ -]`-style class would be a *range* from space to hyphen
    // and would eat ordinary punctuation and digits.
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const trimmed = base.slice(0, 80);
  if (!trimmed) return `attachment.${extension}`;
  return trimmed;
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
