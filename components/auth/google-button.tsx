"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

/** Google's mark, inlined: their brand guidelines require the four-colour G. */
function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 18 18" className="size-4 shrink-0">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.17-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/**
 * A plain link, not a fetch.
 *
 * The OAuth flow is a browser redirect to Google and back; starting it with
 * `fetch` would follow the redirect in the background and never show the consent
 * screen. `next` rides along so the callback can return the user where they were
 * headed.
 */
export function GoogleButton({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const [pending, setPending] = useState(false);

  const href = next ? `/api/auth/google?next=${encodeURIComponent(next)}` : "/api/auth/google";

  return (
    <a
      href={href}
      onClick={() => setPending(true)}
      aria-disabled={pending}
      className="border-input hover:bg-secondary focus-visible:ring-ring inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-md border text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <GoogleMark />
      {pending ? t("working") : t("continueWithGoogle")}
    </a>
  );
}
