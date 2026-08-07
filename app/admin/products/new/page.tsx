import Link from "next/link";

import { ProductForm } from "@/components/admin/product-form";
import { getProductFormOptions } from "@/lib/queries/admin";

export default async function NewProductPage() {
  const options = await getProductFormOptions();

  return (
    <div className="flex flex-col gap-5">
      <header>
        <Link href="/admin/products" className="text-muted-foreground text-sm hover:underline">
          ← Products
        </Link>
        <h1 className="text-display mt-1 text-2xl">New product</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Georgian is required; English and Russian fall back to it when empty.
        </p>
      </header>

      <ProductForm options={options} />
    </div>
  );
}
