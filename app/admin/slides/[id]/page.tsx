import Link from "next/link";
import { notFound } from "next/navigation";

import { SlideForm } from "@/components/admin/slide-form";
import { getAdminSlide, getSlideFormOptions } from "@/lib/queries/admin";

export default async function EditSlidePage({ params }: PageProps<"/admin/slides/[id]">) {
  const { id } = await params;

  const [slide, options] = await Promise.all([getAdminSlide(id), getSlideFormOptions()]);
  if (!slide) notFound();

  return (
    <div className="flex flex-col gap-5">
      <header>
        <Link href="/admin/slides" className="text-muted-foreground text-sm hover:underline">
          ← Homepage banners
        </Link>
        <h1 className="text-display mt-1 text-2xl">Edit banner</h1>
        <p className="text-muted-foreground mt-1 text-sm">{slide.alt.ka}</p>
      </header>

      <SlideForm slide={slide} options={options} />
    </div>
  );
}
