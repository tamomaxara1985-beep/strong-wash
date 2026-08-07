"use client";

import { Heart } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Optimistic toggle: the icon fills immediately and reverts if the write fails.
 * A saved-item toggle that waits for a round trip feels broken on a slow
 * connection, and the failure case is recoverable — nothing is lost by retrying.
 */
export function SaveProductButton({
  productId,
  initiallySaved,
  signedIn,
  className,
}: {
  productId: string;
  initiallySaved: boolean;
  signedIn: boolean;
  className?: string;
}) {
  const t = useTranslations("account");
  const router = useRouter();
  const [saved, setSaved] = useState(initiallySaved);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (!signedIn) {
      router.push("/sign-in");
      return;
    }

    const next = !saved;
    setSaved(next);
    setPending(true);
    try {
      const response = await fetch("/api/account/saved-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, action: next ? "add" : "remove" }),
      });
      if (!response.ok) setSaved(!next);
    } catch {
      setSaved(!next);
    } finally {
      setPending(false);
    }
  }

  const label = !signedIn ? t("signInToSave") : saved ? t("saved") : t("save");

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={signedIn ? saved : undefined}
      className={cn(
        "hover:bg-secondary focus-visible:ring-ring inline-flex h-12 items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60",
        className,
      )}
    >
      <Heart
        aria-hidden
        className={cn("size-4", saved && signedIn && "fill-current text-red-500")}
      />
      {label}
    </button>
  );
}
