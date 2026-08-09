import Link from "next/link";
import { notFound } from "next/navigation";

import { BrandForm } from "@/components/admin/brand-form";
import { getAdminBrand } from "@/lib/queries/admin";

export default async function EditBrandPage({ params }: PageProps<"/admin/brands/[id]">) {
  const { id } = await params;
  const brand = await getAdminBrand(id);
  if (!brand) notFound();

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin/brands" className="text-muted-foreground text-sm hover:underline">
            ← Brands
          </Link>
          <h1 className="text-display mt-1 text-2xl">{brand.name}</h1>
          <p className="text-data text-muted-foreground mt-1 text-sm">
            {brand.slug} · {brand.productCount} product{brand.productCount === 1 ? "" : "s"}
          </p>
        </div>
        <a
          href={`/en/search?brand=${brand.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:bg-secondary inline-flex h-9 items-center rounded-md border px-3 text-sm font-semibold"
        >
          View on site ↗
        </a>
      </header>

      <BrandForm brand={brand} />
    </div>
  );
}
