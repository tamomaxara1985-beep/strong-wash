import { Plus } from "lucide-react";
import Link from "next/link";

import { ProductRowActions } from "@/components/admin/product-row-actions";
import { Badge } from "@/components/ui/badge";
import { listAdminProducts } from "@/lib/queries/admin";

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/products">) {
  const { q } = await searchParams;
  const search = typeof q === "string" ? q : undefined;
  const products = await listAdminProducts(search);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display text-2xl">Products</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {products.length} shown, including ones hidden from the site.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <form method="get" className="flex items-center gap-2">
            <label htmlFor="product-search" className="sr-only">
              Search products
            </label>
            <input
              id="product-search"
              name="q"
              defaultValue={search ?? ""}
              placeholder="SKU, slug or name…"
              className="border-input bg-background focus-visible:border-primary h-9 rounded-md border px-3 text-sm outline-none"
            />
            <button
              type="submit"
              className="bg-secondary h-9 rounded-md px-3 text-sm font-semibold"
            >
              Search
            </button>
          </form>
          <Link
            href="/admin/products/new"
            className="bg-brand-yellow text-brand-black hover:bg-brand-yellow-dark inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-bold transition-colors"
          >
            <Plus aria-hidden className="size-4" />
            New product
          </Link>
        </div>
      </header>

      {products.length === 0 ? (
        <p className="bg-card text-muted-foreground rounded-lg border px-6 py-12 text-center text-sm">
          No products match.
        </p>
      ) : (
        <div className="bg-card overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-semibold">Product</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold">Category</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Price</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold">Availability</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold">State</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Quotes</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-t align-top">
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/products/${product.id}`}
                      className="font-medium hover:underline"
                    >
                      {product.name.en ?? product.name.ka}
                    </Link>
                    <span className="text-data text-muted-foreground block text-xs">
                      {product.sku} · {product.brandName} · {product.images} image
                      {product.images === 1 ? "" : "s"}
                    </span>
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-xs">
                    {product.categoryName.en ?? product.categoryName.ka}
                  </td>
                  <td className="text-data px-3 py-2 text-right">
                    {product.salePrice != null ? (
                      <>
                        <span className="font-semibold">{product.salePrice.toLocaleString()}</span>
                        <span className="text-muted-foreground block text-xs line-through">
                          {product.price.toLocaleString()}
                        </span>
                      </>
                    ) : (
                      product.price.toLocaleString()
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {product.stockStatus.replace("_", " ")}
                    <span className="text-muted-foreground block">{product.stock} units</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {product.isActive ? (
                        <Badge variant="secondary">active</Badge>
                      ) : (
                        <Badge variant="outline">hidden</Badge>
                      )}
                      {product.isFeatured ? <Badge>featured</Badge> : null}
                      {/* Surfaced rather than blocked: shipping before the
                          translations are done is legitimate, but the operator
                          should see which are outstanding. */}
                      {product.missingLocales.length ? (
                        <Badge variant="outline" className="text-amber-600">
                          no {product.missingLocales.join("/")}
                        </Badge>
                      ) : null}
                    </div>
                  </td>
                  <td className="text-data px-3 py-2 text-right">{product.quoteCount}</td>
                  <td className="px-3 py-2">
                    <ProductRowActions
                      id={product.id}
                      sku={product.sku}
                      name={product.name.en ?? product.name.ka}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
