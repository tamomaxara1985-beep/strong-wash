"use client";

import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function SignOutButton({ className }: { className?: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await fetch("/api/auth/sign-out", { method: "POST" }).catch(() => {});
    // `refresh()` after `replace()` so the header re-renders without the session:
    // the layout is a server component and would otherwise be served from the
    // client router cache still showing the signed-in state.
    router.replace("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={pending}
      className={cn(
        "hover:bg-secondary focus-visible:ring-ring inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60",
        className,
      )}
    >
      <LogOut aria-hidden className="size-4" />
      {pending ? t("working") : t("signOut")}
    </button>
  );
}
