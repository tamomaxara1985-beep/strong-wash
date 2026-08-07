import { Plus } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { listAdminCategories } from "@/lib/queries/admin";

export default async function AdminCategoriesPage() {
  const categories = await listAdminCategories();

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display text-2xl">Categories</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {categories.length} in the tree, including ones hidden from the site.
            Indentation shows nesting.
          </p>
        </div>
        <Link
          href="/admin/categories/new"
          className="bg-brand-yellow text-brand-black hover:bg-brand-yellow-dark inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-bold transition-colors"
        >
          <Plus aria-hidden className="size-4" />
          New category
        </Link>
      </header>

      <div className="bg-card overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-semibold">Category</th>
              <th scope="col" className="px-3 py-2 text-left font-semibold">Path</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Here</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Incl. sub</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Order</th>
              <th scope="col" className="px-3 py-2 text-left font-semibold">State</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id} className="border-t">
                <td className="px-3 py-2">
                  <span
                    className="inline-flex items-center gap-2"
                    // Indent by depth so the hierarchy is readable without a
                    // nested table.
                    style={{ paddingLeft: `${category.depth * 20}px` }}
                  >
                    {category.depth > 0 ? (
                      <span aria-hidden className="text-muted-foreground">
                        └
                      </span>
                    ) : null}
                    <Link
                      href={`/admin/categories/${category.id}`}
                      className="font-medium hover:underline"
                    >
                      {category.name.en ?? category.name.ka}
                    </Link>
                  </span>
                  {category.children > 0 ? (
                    <span className="text-muted-foreground ml-2 text-xs">
                      {category.children} sub
                    </span>
                  ) : null}
                </td>
                <td className="text-data text-muted-foreground px-3 py-2 text-xs">
                  {category.path}
                </td>
                <td className="text-data px-3 py-2 text-right">{category.ownProducts}</td>
                <td className="text-data px-3 py-2 text-right">{category.subtreeProducts}</td>
                <td className="text-data px-3 py-2 text-right">{category.order}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {category.isActive ? (
                      <Badge variant="secondary">active</Badge>
                    ) : (
                      <Badge variant="outline">hidden</Badge>
                    )}
                    {category.missingLocales.length ? (
                      <Badge variant="outline" className="text-amber-600">
                        no {category.missingLocales.join("/")}
                      </Badge>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-muted-foreground text-xs">
        &ldquo;Here&rdquo; counts products filed directly in a category;
        &ldquo;Incl. sub&rdquo; counts everything underneath it, which is what the
        storefront shows. Filter attributes are still defined in code — a category
        inherits its ancestors&rsquo;.
      </p>
    </div>
  );
}
