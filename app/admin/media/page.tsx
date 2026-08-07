import { MediaManager } from "@/components/admin/media-manager";
import { listMedia } from "@/lib/queries/admin";

export default async function AdminMediaPage({
  searchParams,
}: PageProps<"/admin/media">) {
  const { q } = await searchParams;
  const search = typeof q === "string" ? q : undefined;
  const assets = await listMedia(search);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display text-2xl">Media library</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Reusable files. Upload, rename, replace or delete — deleting removes the
            stored file from Cloudinary as well.
          </p>
        </div>
        {/* A GET form keeps the search in the URL, so a filtered view is
            shareable and survives a refresh. */}
        <form method="get" className="flex items-center gap-2">
          <label htmlFor="media-search" className="sr-only">
            Search files
          </label>
          <input
            id="media-search"
            name="q"
            defaultValue={search ?? ""}
            placeholder="Search by title…"
            className="border-input bg-background focus-visible:border-primary h-9 rounded-md border px-3 text-sm outline-none"
          />
          <button
            type="submit"
            className="bg-brand-black h-9 rounded-md px-3 text-sm font-semibold text-white"
          >
            Search
          </button>
        </form>
      </header>

      <MediaManager assets={assets} />
    </div>
  );
}
