/**
 * Maps the `?error=` codes the OAuth routes redirect with onto translations.
 *
 * The routes cannot return a JSON body — the user arrives by browser navigation —
 * so the failure travels as a code in the query string and is rendered here.
 */
export function googleErrorMessage(
  code: string,
  t: (key: string) => string,
): string | null {
  switch (code) {
    case "google_cancelled":
      return t("googleCancelled");
    case "google_unavailable":
      return t("googleUnavailable");
    case "google_email_unverified":
      return t("googleEmailUnverified");
    case "google_failed":
      return t("googleFailed");
    default:
      // An unknown code is not rendered: echoing an arbitrary query parameter
      // into the page is how reflected content ends up on screen.
      return null;
  }
}
