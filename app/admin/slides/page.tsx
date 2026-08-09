import { Plus } from "lucide-react";
import Link from "next/link";

import { SlideRowActions } from "@/components/admin/slide-row-actions";
import { Badge } from "@/components/ui/badge";
import { listAdminSlides } from "@/lib/queries/admin";

export default async function AdminSlidesPage() {
  const slides = await listAdminSlides();
  const active = slides.filter((slide) => slide.isActive).length;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display text-2xl">Homepage banners</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {active} shown on the homepage, {slides.length} in total. With none active the
            homepage falls back to its original header.
          </p>
        </div>
        <Link
          href="/admin/slides/new"
          className="bg-brand-yellow text-brand-black hover:bg-brand-yellow-dark inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-bold transition-colors"
        >
          <Plus aria-hidden className="size-4" />
          New banner
        </Link>
      </header>

      <div className="bg-card overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-semibold">Banner</th>
              <th scope="col" className="px-3 py-2 text-left font-semibold">Alt text (KA)</th>
              <th scope="col" className="px-3 py-2 text-left font-semibold">Links to</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Order</th>
              <th scope="col" className="px-3 py-2 text-left font-semibold">State</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {slides.map((slide) => (
              <tr key={slide.id} className="border-t">
                <td className="px-3 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={slide.image}
                    alt=""
                    className="bg-brand-black h-12 w-20 rounded object-contain"
                  />
                </td>
                <td className="max-w-72 px-3 py-2">{slide.alt.ka}</td>
                <td className="text-data text-muted-foreground px-3 py-2 text-xs">
                  {slide.href ?? "—"}
                </td>
                <td className="text-data px-3 py-2 text-right">{slide.order}</td>
                <td className="px-3 py-2">
                  {slide.isActive ? (
                    <Badge variant="secondary">active</Badge>
                  ) : (
                    <Badge variant="outline">hidden</Badge>
                  )}
                </td>
                <td className="px-3 py-2">
                  <SlideRowActions id={slide.id} label={slide.alt.ka} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-muted-foreground text-xs">
        Banners are shown lowest order first. Upload the images at{" "}
        <Link href="/admin/media" className="underline">
          Media library
        </Link>{" "}
        first, then pick one here.
      </p>
    </div>
  );
}
