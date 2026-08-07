"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * The panel's own sign-out control.
 *
 * Not the storefront's `SignOutButton`: that one calls `useTranslations`, and
 * `/admin` is deliberately outside the locale tree, so there is no
 * `NextIntlClientProvider` to read from — reusing it made every admin page 500.
 * It also uses the locale-aware router, which would send an operator to `/ka`.
 * Plain English and Next's own router are correct here.
 */
export function AdminSignOut({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await fetch("/api/auth/sign-out", { method: "POST" }).catch(() => {});
    // `refresh()` after `replace()`: the layout is a server component and would
    // otherwise be served from the client router cache still showing the panel.
    router.replace("/ka");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={pending}
      className={cn(
        "focus-visible:ring-ring inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60",
        className,
      )}
    >
      <LogOut aria-hidden className="size-4" />
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
