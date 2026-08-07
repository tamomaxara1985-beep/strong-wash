"use client";

import { CheckCircle2, FileText, Paperclip, Send, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ACCEPT_ATTRIBUTE,
  MAX_FILES,
  MAX_FILE_BYTES,
  formatBytes,
} from "@/lib/uploads";
import { cn } from "@/lib/utils";

type Picked = { file: File; previewUrl: string | null };

/**
 * Quote request with optional attachments.
 *
 * Files are held locally until submit and posted as one multipart request with
 * the enquiry, so an abandoned form uploads nothing. The size and count checks
 * here are for immediate feedback only — the route re-checks every byte and
 * sniffs the real type, because nothing arriving from a browser is evidence.
 */
export function QuoteRequestDialog({
  productSlug,
  locale,
  defaults,
}: {
  productSlug: string;
  locale: string;
  defaults?: { name?: string; email?: string; phone?: string; company?: string };
}) {
  const t = useTranslations("quote");
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const sizeLabel = formatBytes(MAX_FILE_BYTES);

  function reset() {
    for (const item of picked) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    setPicked([]);
    setError(null);
    setDone(false);
  }

  /**
   * Every close path goes through here.
   *
   * `onOpenChange` only fires for Radix's own dismissals — the overlay, Escape,
   * the corner X. Calling `setOpen(false)` from our own button skips it, which
   * left `done` true and showed the previous success panel the next time the
   * dialog was opened.
   */
  function closeDialog() {
    setOpen(false);
    reset();
  }

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setError(null);

    const incoming = Array.from(list);
    if (picked.length + incoming.length > MAX_FILES) {
      setError(t("errorTooMany", { count: MAX_FILES }));
      return;
    }

    const accepted: Picked[] = [];
    for (const file of incoming) {
      if (file.size > MAX_FILE_BYTES) {
        setError(t("errorTooLarge", { size: sizeLabel }));
        continue;
      }
      accepted.push({
        file,
        // Object URLs are revoked on removal and on close; leaving them alive
        // holds the whole file in memory for the life of the page.
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      });
    }
    setPicked((current) => [...current, ...accepted]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeAt(index: number) {
    setPicked((current) => {
      const item = current[index];
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return current.filter((_, i) => i !== index);
    });
  }

  function messageFor(body: { error?: string; reason?: string }): string {
    switch (body.error) {
      case "rate_limited":
        return t("errorRateLimited");
      case "too_many_files":
        return t("errorTooMany", { count: MAX_FILES });
      case "payload_too_large":
        return t("errorTooLarge", { size: sizeLabel });
      case "uploads_not_configured":
        return t("errorUploadsOff");
      case "file_rejected":
        if (body.reason === "too_large") return t("errorTooLarge", { size: sizeLabel });
        if (body.reason === "unreadable") return t("errorUnreadable");
        return t("errorType");
      default:
        return t("errorGeneric");
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    form.set("productSlug", productSlug);
    form.set("locale", locale);
    // Replace the picker's own entries with the curated list, which reflects
    // removals the user made after choosing.
    form.delete("attachments");
    for (const item of picked) form.append("attachments", item.file, item.file.name);

    try {
      const response = await fetch("/api/quote-requests", { method: "POST", body: form });
      if (response.ok) {
        reset();
        setDone(true);
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string; reason?: string };
      setError(messageFor(body));
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="bg-brand-yellow hover:bg-brand-yellow-dark h-12 text-sm font-bold text-black">
          <Send aria-hidden className="size-4" />
          {t("openCta")}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {done ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 aria-hidden className="size-10 text-green-600" />
            <DialogTitle>{t("successTitle")}</DialogTitle>
            <DialogDescription>{t("successText")}</DialogDescription>
            <Button variant="secondary" onClick={closeDialog} className="mt-2">
              {t("close")}
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("title")}</DialogTitle>
              <DialogDescription>{t("subtitle")}</DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
              {error ? (
                <p
                  role="alert"
                  className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
                >
                  {error}
                </p>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="q-name">{t("name")}</Label>
                  <Input
                    id="q-name"
                    name="name"
                    required
                    autoComplete="name"
                    defaultValue={defaults?.name ?? ""}
                    className="h-10"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="q-email">{t("email")}</Label>
                  <Input
                    id="q-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    defaultValue={defaults?.email ?? ""}
                    className="h-10"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="q-phone">
                    {t("phone")}{" "}
                    <span className="text-muted-foreground font-normal">({t("optional")})</span>
                  </Label>
                  <Input
                    id="q-phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    defaultValue={defaults?.phone ?? ""}
                    className="h-10"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="q-company">
                    {t("company")}{" "}
                    <span className="text-muted-foreground font-normal">({t("optional")})</span>
                  </Label>
                  <Input
                    id="q-company"
                    name="company"
                    autoComplete="organization"
                    defaultValue={defaults?.company ?? ""}
                    className="h-10"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="q-message">
                  {t("message")}{" "}
                  <span className="text-muted-foreground font-normal">({t("optional")})</span>
                </Label>
                <textarea
                  id="q-message"
                  name="message"
                  rows={3}
                  maxLength={4000}
                  placeholder={t("messagePlaceholder")}
                  className="border-input bg-background placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/25 w-full rounded-md border px-3 py-2 text-sm transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:outline-none"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="q-files">
                  {t("attachments")}{" "}
                  <span className="text-muted-foreground font-normal">({t("optional")})</span>
                </Label>
                <p id="q-files-hint" className="text-muted-foreground text-xs">
                  {t("attachmentsHint", { count: MAX_FILES, size: sizeLabel })}
                </p>
                <input
                  ref={inputRef}
                  id="q-files"
                  name="attachments"
                  type="file"
                  multiple
                  accept={ACCEPT_ATTRIBUTE}
                  aria-describedby="q-files-hint"
                  onChange={(event) => addFiles(event.target.files)}
                  disabled={picked.length >= MAX_FILES}
                  className="text-muted-foreground file:bg-secondary file:text-secondary-foreground hover:file:bg-secondary/70 w-full text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-semibold disabled:opacity-50"
                />

                {picked.length ? (
                  <ul className="flex flex-col gap-2">
                    {picked.map((item, index) => (
                      <li
                        key={`${item.file.name}-${index}`}
                        className="bg-secondary/40 flex items-center gap-3 rounded-md p-2"
                      >
                        {item.previewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.previewUrl}
                            alt=""
                            className="size-10 shrink-0 rounded object-cover"
                          />
                        ) : (
                          <span className="bg-background grid size-10 shrink-0 place-items-center rounded">
                            <FileText aria-hidden className="text-muted-foreground size-5" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{item.file.name}</span>
                          <span className="text-data text-muted-foreground text-xs">
                            {formatBytes(item.file.size)}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => removeAt(index)}
                          className="hover:bg-background focus-visible:ring-ring rounded-md p-1.5 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                        >
                          <X aria-hidden className="size-4" />
                          <span className="sr-only">{t("removeFile")}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <Button
                type="submit"
                disabled={pending}
                className={cn("h-11 w-full text-sm font-bold", pending && "opacity-70")}
              >
                <Paperclip aria-hidden className="size-4" />
                {pending ? t("sending") : t("submit")}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
