import { Plus } from "lucide-react";
import Link from "next/link";

import { BrandRowActions } from "@/components/admin/brand-row-actions";
import { Badge } from "@/components/ui/badge";
import { listAdminBrands } from "@/lib/queries/admin";

export default async function AdminBrandsPage() {
  const brands = await listAdminBrands();

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display text-2xl">Brands</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {brands.length} manufacturer{brands.length === 1 ? "" : "s"}, including ones hidden from
            the site.
          </p>
        </div>
        <Link
          href="/admin/brands/new"
          className="bg-brand-yellow text-brand-black hover:bg-brand-yellow-dark inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-bold transition-colors"
        >
          <Plus aria-hidden className="size-4" />
          New brand
        </Link>
      </header>

      <div className="bg-card overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-semibold">Brand</th>
              <th scope="col" className="px-3 py-2 text-left font-semibold">Slug</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Products</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Order</th>
              <th scope="col" className="px-3 py-2 text-left font-semibold">State</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {brands.map((brand) => (
              <tr key={brand.id} className="border-t">
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/brands/${brand.id}`}
                    className="font-medium hover:underline"
                  >
                    {brand.name}
                  </Link>
                </td>
                <td className="text-data text-muted-foreground px-3 py-2 text-xs">{brand.slug}</td>
                <td className="text-data px-3 py-2 text-right">{brand.productCount}</td>
                <td className="text-data px-3 py-2 text-right">{brand.order}</td>
                <td className="px-3 py-2">
                  {brand.isActive ? (
                    <Badge variant="secondary">active</Badge>
                  ) : (
                    <Badge variant="outline">hidden</Badge>
                  )}
                </td>
                <td className="px-3 py-2">
                  <BrandRowActions id={brand.id} name={brand.name} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-muted-foreground text-xs">
        A brand can only be deleted once no product uses it. Hiding one instead takes it out of the
        storefront filter while its machines stay listed under their manufacturer&rsquo;s name.
      </p>
    </div>
  );
}
