import Link from "next/link";

import { CategoryForm } from "@/components/admin/category-form";
import { listAdminCategories } from "@/lib/queries/admin";

export default async function NewCategoryPage() {
  const categories = await listAdminCategories();

  // Any existing category can be the parent of a brand-new one — there is no
  // subtree to create a cycle with yet.
  const parents = categories.map((category) => ({
    id: category.id,
    label: `${"— ".repeat(category.depth)}${category.name.en ?? category.name.ka}`,
  }));

  return (
    <div className="flex flex-col gap-5">
      <header>
        <Link href="/admin/categories" className="text-muted-foreground text-sm hover:underline">
          ← Categories
        </Link>
        <h1 className="text-display mt-1 text-2xl">New category</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Georgian is required; English and Russian fall back to it when empty.
        </p>
      </header>

      <CategoryForm parents={parents} />
    </div>
  );
}
