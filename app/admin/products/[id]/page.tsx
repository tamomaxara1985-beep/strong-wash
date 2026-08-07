import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductForm } from "@/components/admin/product-form";
import { getAdminProduct, getProductFormOptions } from "@/lib/queries/admin";

export default async function EditProductPage({ params }: PageProps<"/admin/products/[id]">) {
  const { id } = await params;

  const [product, options] = await Promise.all([getAdminProduct(id), getProductFormOptions()]);
  if (!product) notFound();

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin/products" className="text-muted-foreground text-sm hover:underline">
            ← Products
          </Link>
          <h1 className="text-display mt-1 text-2xl">{product.name.en ?? product.name.ka}</h1>
          <p className="text-data text-muted-foreground mt-1 text-sm">{product.sku}</p>
        </div>
        {/* Straight to the live page, so a change can be checked where customers
            see it. */}
        <a
          href={`/en/p/${product.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:bg-secondary inline-flex h-9 items-center rounded-md border px-3 text-sm font-semibold"
        >
          View on site ↗
        </a>
      </header>

      <ProductForm product={product} options={options} />
    </div>
  );
}
