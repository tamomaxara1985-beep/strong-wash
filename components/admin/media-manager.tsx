"use client";

import { FileText, Pencil, Replace, Trash2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MediaRow } from "@/lib/queries/admin";
import { ACCEPT_ATTRIBUTE, MAX_FILES, MAX_FILE_BYTES, formatBytes } from "@/lib/uploads";
import { cn } from "@/lib/utils";

function errorMessage(body: { error?: string; reason?: string }): string {
  switch (body.error) {
    case "payload_too_large":
      return `File too large — ${formatBytes(MAX_FILE_BYTES)} maximum.`;
    case "too_many_files":
      return `At most ${MAX_FILES} files at a time.`;
    case "uploads_not_configured":
      return "Cloudinary is not configured on this deployment.";
    case "file_rejected":
      if (body.reason === "too_large") return `File too large — ${formatBytes(MAX_FILE_BYTES)} maximum.`;
      if (body.reason === "unreadable") return "That file is damaged or unreadable.";
      return "Only JPG, PNG, WebP and PDF are accepted.";
    case "forbidden":
    case "unauthenticated":
      return "Your session no longer has admin access. Sign in again.";
    default:
      return "That did not work. Please try again.";
  }
}

export function MediaManager({ assets }: { assets: MediaRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);

  async function send(url: string, init: RequestInit, key: string) {
    setBusy(key);
    setError(null);
    try {
      const response = await fetch(url, init);
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string; reason?: string };
        setError(errorMessage(body));
        return false;
      }
      // The list is server-rendered, so a refresh is what shows the new state.
      router.refresh();
      return true;
    } catch {
      setError("That did not work. Please try again.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    if (files.length > MAX_FILES) {
      setError(`At most ${MAX_FILES} files at a time.`);
      return;
    }
    const oversize = Array.from(files).find((f) => f.size > MAX_FILE_BYTES);
    if (oversize) {
      setError(`${oversize.name} is over ${formatBytes(MAX_FILE_BYTES)}.`);
      return;
    }

    const form = new FormData();
    for (const file of Array.from(files)) form.append("files", file, file.name);
    const ok = await send("/api/admin/media", { method: "POST", body: form }, "upload");
    if (ok && uploadRef.current) uploadRef.current.value = "";
  }

  async function saveTitle(id: string) {
    const title = titleDraft.trim();
    if (!title) {
      setError("Title cannot be empty.");
      return;
    }
    const ok = await send(
      `/api/admin/media/${id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      },
      `title-${id}`,
    );
    if (ok) setEditing(null);
  }

  async function replaceFile(id: string, files: FileList | null) {
    const file = files?.[0];
    setReplacingId(null);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError(`${file.name} is over ${formatBytes(MAX_FILE_BYTES)}.`);
      return;
    }
    const form = new FormData();
    form.append("file", file, file.name);
    await send(`/api/admin/media/${id}`, { method: "PATCH", body: form }, `replace-${id}`);
    if (replaceRef.current) replaceRef.current.value = "";
  }

  async function remove(asset: MediaRow) {
    // Deleting removes the stored file too, so it is worth one confirmation.
    if (!window.confirm(`Delete "${asset.title}"? The file is removed from storage as well.`)) {
      return;
    }
    await send(`/api/admin/media/${asset.id}`, { method: "DELETE" }, `delete-${asset.id}`);
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
        >
          {error}
        </p>
      ) : null}

      <div className="bg-card flex flex-wrap items-center gap-3 rounded-lg border p-4">
        <label htmlFor="media-upload" className="text-sm font-semibold">
          Upload files
        </label>
        <input
          ref={uploadRef}
          id="media-upload"
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          disabled={busy === "upload"}
          onChange={(event) => upload(event.target.files)}
          className="text-muted-foreground file:bg-secondary file:text-secondary-foreground hover:file:bg-secondary/70 text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-semibold disabled:opacity-50"
        />
        <span className="text-muted-foreground text-xs">
          JPG, PNG, WebP, PDF — {formatBytes(MAX_FILE_BYTES)} each, {MAX_FILES} at a time
        </span>
        {busy === "upload" ? (
          <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
            <Upload aria-hidden className="size-3.5 animate-pulse" />
            uploading…
          </span>
        ) : null}
      </div>

      {/* One hidden input, reused for whichever row is replacing its file. */}
      <input
        ref={replaceRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        className="hidden"
        onChange={(event) => replacingId && replaceFile(replacingId, event.target.files)}
      />

      {assets.length === 0 ? (
        <p className="bg-card text-muted-foreground rounded-lg border px-6 py-12 text-center text-sm">
          No files yet. Upload one above.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {assets.map((asset) => (
            <li key={asset.id} className="bg-card flex flex-col rounded-lg border">
              <div className="bg-secondary/40 relative grid aspect-video place-items-center overflow-hidden rounded-t-lg">
                {asset.isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asset.url}
                    alt={asset.title}
                    className="size-full object-contain"
                    loading="lazy"
                  />
                ) : (
                  <FileText aria-hidden className="text-muted-foreground size-10" />
                )}
              </div>

              <div className="flex flex-1 flex-col gap-2 p-3">
                {editing === asset.id ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={titleDraft}
                      onChange={(event) => setTitleDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") saveTitle(asset.id);
                        if (event.key === "Escape") setEditing(null);
                      }}
                      aria-label="Title"
                      className="h-8"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      onClick={() => saveTitle(asset.id)}
                      disabled={busy === `title-${asset.id}`}
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      <X aria-hidden className="size-4" />
                      <span className="sr-only">Cancel</span>
                    </Button>
                  </div>
                ) : (
                  <p className="truncate text-sm font-semibold" title={asset.title}>
                    {asset.title}
                  </p>
                )}

                <p className="text-data text-muted-foreground text-xs">
                  {asset.format.toUpperCase()} · {formatBytes(asset.bytes)}
                  {asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ""}
                </p>

                <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditing(asset.id);
                      setTitleDraft(asset.title);
                    }}
                  >
                    <Pencil aria-hidden className="size-3.5" />
                    Rename
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy === `replace-${asset.id}`}
                    onClick={() => {
                      setReplacingId(asset.id);
                      replaceRef.current?.click();
                    }}
                  >
                    <Replace aria-hidden className="size-3.5" />
                    Replace
                  </Button>
                  <a
                    href={asset.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:bg-secondary focus-visible:ring-ring inline-flex h-8 items-center rounded-lg px-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  >
                    Open
                  </a>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === `delete-${asset.id}`}
                    onClick={() => remove(asset)}
                    className={cn("text-destructive hover:bg-destructive/10")}
                  >
                    <Trash2 aria-hidden className="size-3.5" />
                    Delete
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
