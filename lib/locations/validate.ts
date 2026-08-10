/**
 * The one URL on this site that is supposed to leave it.
 *
 * Everywhere else a user-supplied link is forced to stay internal —
 * `isSiteRelativePath` in `lib/slides/validate.ts` exists precisely to stop a
 * banner becoming an off-site link. A branch's map link is the opposite, so it
 * gets its own narrow rule rather than a relaxation of that one.
 *
 * An allowlist rather than "any https URL" because this renders as a link on a
 * public page, and "paste a link here" is the shape of every open redirect that
 * ever shipped.
 */
export const MAP_HOSTS = [
  "google.com",
  "www.google.com",
  "maps.google.com",
  "goo.gl",
  "maps.app.goo.gl",
];

export function isMapUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  // Exact host match, never `endsWith`: google.com.evil.example ends with the
  // right string and is a different site.
  return url.protocol === "https:" && MAP_HOSTS.includes(url.hostname);
}
