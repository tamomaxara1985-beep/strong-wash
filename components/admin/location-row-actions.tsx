"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Per-row edit and delete.
 *
 * The server refuses to delete the only branch; this renders that refusal as the
 * thing to do instead, because "cannot delete" without an alternative is where an
 * operator gets stuck.
 */
export function LocationRowActions({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(`Delete "${name}"?\n\nThis cannot be undone.`)) return;

    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/locations/${id}`, { method: "DELETE" });
      if (response.ok) {
        router.refresh();
        return;
      }

      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (body.error === "last_location") {
        setError(
          "This is your only location, and the site needs one. Add another first, or untick “Active” to take it off the site instead.",
        );
      } else if (body.error === "forbidden" || body.error === "unauthenticated") {
        setError("Your session no longer has admin access. Sign in again.");
      } else {
        setError("Could not delete that location.");
      }
    } catch {
      setError("Could not delete that location.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex justify-end gap-1.5">
        <Link
          href={`/admin/locations/${id}`}
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
