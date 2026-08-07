"use client";

import { FileText, Trash2 } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AttachmentRow } from "@/lib/queries/admin";
import { formatBytes } from "@/lib/uploads";

/**
 * Delete only, deliberately.
 *
 * These files are what a customer actually sent with an enquiry, so replacing one
 * would rewrite the record. Delete exists because people ask for their photos to
 * be removed.
 */
export function AttachmentList({ rows }: { rows: AttachmentRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(row: AttachmentRow) {
    if (
      !window.confirm(
        `Delete "${row.originalName}" from ${row.quote.email}'s enquiry? This removes the file from storage.`,
      )
    ) {
      return;
    }

    setBusy(row.publicId);
    setError(null);
    try {
      const response = await fetch("/api/admin/attachments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: row.quoteId, publicId: row.publicId }),
      });
      if (!response.ok) {
        setError("Could not delete that file. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not delete that file. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  if (!rows.length) {
    return (
      <p className="bg-card text-muted-foreground rounded-lg border px-6 py-12 text-center text-sm">
        No customer attachments yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
        >
          {error}
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={`${row.quoteId}-${row.publicId}`}
            className="bg-card flex flex-wrap items-center gap-3 rounded-lg border p-3"
          >
            <a
              href={row.url}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-secondary/40 grid size-14 shrink-0 place-items-center overflow-hidden rounded"
            >
              {row.isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={row.url} alt={row.originalName} className="size-full object-cover" loading="lazy" />
              ) : (
                <FileText aria-hidden className="text-muted-foreground size-6" />
              )}
            </a>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{row.originalName}</p>
              <p className="text-muted-foreground truncate text-xs">
                {row.quote.name} · {row.quote.email}
                {row.quote.productSlug ? ` · ${row.quote.productSlug}` : ""}
              </p>
              <p className="text-data text-muted-foreground text-xs">
                {row.format.toUpperCase()} · {formatBytes(row.bytes)} ·{" "}
                {new Date(row.quote.createdAt).toLocaleDateString("en-GB")}
              </p>
            </div>

            <Badge variant="secondary">{row.quote.status}</Badge>

            <Button
              size="sm"
              variant="ghost"
              disabled={busy === row.publicId}
              onClick={() => remove(row)}
              className="text-destructive hover:bg-destructive/10"
            >
              <Trash2 aria-hidden className="size-3.5" />
              Delete
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
