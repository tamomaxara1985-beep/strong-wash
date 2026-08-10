/**
 * The two rules that keep a slide from breaking the page it renders on.
 *
 * Pure and dependency-free, because the client form and the route handler both
 * need them and neither should import the other.
 */

/**
 * `next/image` refuses any host absent from `next.config.ts` remotePatterns, and
 * it refuses it at render time — on the homepage, for every visitor, not on the
 * admin page where the wrong URL was pasted. So the URL is checked where the
 * mistake is still cheap.
 *
 * The cloud name comes from the environment when it is set, matching the
 * `res.cloudinary.com/<cloud>/**` pattern in next.config.ts. With it unset — a
 * script, or a misconfigured deploy — the host check alone still holds.
 */
export function isCloudinaryImageUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com") return false;

  const cloud = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  if (!cloud) return true;
  return url.pathname.startsWith(`/${cloud}/`);
}

/**
 * A slide's link must stay on this site.
 *
 * An absolute URL would turn the homepage banner into an off-site link, and a
 * `javascript:` value into something worse. A leading `//` is rejected too: the
 * browser reads it as protocol-relative and it leaves the site just as surely as
 * `https://` does.
 *
 * A raw prefix check on the string is not enough: the WHATWG URL parser strips
 * literal tabs, CRs and LFs out of a URL before parsing it, so a value like
 * `/\t/evil.example` — a leading slash, a tab, then a slash — resolves to the
 * protocol-relative `//evil.example` even though `startsWith("//")` is false on
 * the raw string. The browser normalises away characters a string check cannot
 * see, so after the cheap structural gate this asks the URL parser itself where
 * the value actually resolves, against a sentinel base, and requires the host to
 * come back unchanged.
 */
export function isSiteRelativePath(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//")) return false;

  try {
    return new URL(value, "https://sentinel.invalid").host === "sentinel.invalid";
  } catch {
    return false;
  }
}
