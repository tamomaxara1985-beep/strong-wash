"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Per-row edit and delete.
 *
 * Delete lives on the list rather than inside the edit form: the list is where the
 * decision to remove a brand is made. The server enforces the product guard; this
 * only surfaces the action and renders the refusal.
 */
export function BrandRowActions({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(`Delete "${name}"?\n\nThis cannot be undone.`)) return;

    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/brands/${id}`, { method: "DELETE" });
      if (response.ok) {
        router.refresh();
        return;
      }

      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        products?: number;
      };
      if (body.error === "has_products") {
        // Actionable rather than just refused: the alternative is one click away.
        const count = body.products ?? 0;
        setError(
          `${count} product${count === 1 ? "" : "s"} use${count === 1 ? "s" : ""} this brand, so ${
            count === 1 ? "it" : "they"
          } would be left without a manufacturer. Open it and untick "Active" to take it off the site instead.`,
        );
      } else if (body.error === "forbidden" || body.error === "unauthenticated") {
        setError("Your session no longer has admin access. Sign in again.");
      } else {
        setError("Could not delete that brand.");
      }
    } catch {
      setError("Could not delete that brand.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex justify-end gap-1.5">
        <Link
          href={`/admin/brands/${id}`}
          className="hover:bg-secondary focus-visible:ring-ring inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <Pencil aria-hidden className="size-3.5" />
          Edit
        </Link>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={remove}
          className="text-destructive hover:bg-destructive/10"
        >
          <Trash2 aria-hidden className="size-3.5" />
          {pending ? "Deleting…" : "Delete"}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-destructive max-w-72 text-right text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
