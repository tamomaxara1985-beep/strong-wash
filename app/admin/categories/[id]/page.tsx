import Link from "next/link";
import { notFound } from "next/navigation";

import { CategoryForm } from "@/components/admin/category-form";
import { invalidParents } from "@/lib/categories/write";
import { getAdminCategory, listAdminCategories } from "@/lib/queries/admin";

export default async function EditCategoryPage({ params }: PageProps<"/admin/categories/[id]">) {
  const { id } = await params;

  const [category, categories, excluded] = await Promise.all([
    getAdminCategory(id),
    listAdminCategories(),
    invalidParents(id),
  ]);
  if (!category) notFound();

  /**
   * Itself and its descendants are removed from the picker, since either would
   * detach the branch from every root. The API refuses them too — this only keeps
   * the impossible choice off the screen.
   */
  const parents = categories
    .filter((option) => !excluded.includes(option.id))
    .map((option) => ({
      id: option.id,
      label: `${"— ".repeat(option.depth)}${option.name.en ?? option.name.ka}`,
    }));

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin/categories" className="text-muted-foreground text-sm hover:underline">
            ← Categories
          </Link>
          <h1 className="text-display mt-1 text-2xl">{category.name.en ?? category.name.ka}</h1>
          <p className="text-data text-muted-foreground mt-1 text-sm">
            {category.path} · {category.subtreeProducts} product
            {category.subtreeProducts === 1 ? "" : "s"} including subcategories
          </p>
        </div>
        <a
          href={`/en/c${category.path}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:bg-secondary inline-flex h-9 items-center rounded-md border px-3 text-sm font-semibold"
        >
          View on site ↗
        </a>
      </header>

      <CategoryForm category={category} parents={parents} />
    </div>
  );
}
