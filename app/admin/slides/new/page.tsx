import Link from "next/link";

import { SlideForm } from "@/components/admin/slide-form";
import { getSlideFormOptions } from "@/lib/queries/admin";

export default async function NewSlidePage() {
  const options = await getSlideFormOptions();

  return (
    <div className="flex flex-col gap-5">
      <header>
        <Link href="/admin/slides" className="text-muted-foreground text-sm hover:underline">
          ← Homepage banners
        </Link>
        <h1 className="text-display mt-1 text-2xl">New banner</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          One image is shown to every language. Georgian alt text is required.
        </p>
      </header>

      <SlideForm options={options} />
    </div>
  );
}
