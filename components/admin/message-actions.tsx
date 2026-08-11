"use client";

import { MailOpen, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Mark handled, reopen, delete.
 *
 * Deleting asks first and says it cannot be undone: a message is someone's words
 * and there is no second copy anywhere.
 */
export function MessageActions({
  id,
  status,
  subject,
}: {
  id: string;
  status: "new" | "handled";
  subject: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(next: "new" | "handled") {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (response.ok) {
        router.refresh();
        return;
      }
      setError("Could not update that message.");
    } catch {
      setError("Could not update that message.");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${subject}"?\n\nThis cannot be undone.`)) return;

    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/messages/${id}`, { method: "DELETE" });
      if (response.ok) {
        router.push("/admin/messages");
        router.refresh();
        return;
      }
      setError("Could not delete that message.");
    } catch {
      setError("Could not delete that message.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-1.5">
        {status === "new" ? (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => setStatus("handled")}>
            <MailOpen aria-hidden className="size-3.5" />
            Mark handled
          </Button>
        ) : (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setStatus("new")}>
            <RotateCcw aria-hidden className="size-3.5" />
            Reopen
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={remove}
          className="text-destructive hover:bg-destructive/10"
        >
          <Trash2 aria-hidden className="size-3.5" />
          {pending ? "Working…" : "Delete"}
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
