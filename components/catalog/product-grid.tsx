import { ProductCard } from "@/components/catalog/product-card";
import { Skeleton } from "@/components/ui/skeleton";
import { getSpecSchemaLookup } from "@/lib/queries/categories";
import type { Locale, Product } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Async so callers do not each have to thread the spec-schema lookup down. The
 * lookup itself is request-cached, so the extra await costs nothing after the
 * first grid on the page.
 */
export async function ProductGrid({
  products,
  locale,
  className,
}: {
  products: Product[];
  locale: Locale;
  className?: string;
}) {
  const specSchema = await getSpecSchemaLookup();

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4",
        className,
      )}
    >
      {products.map((product, index) => (
        <ProductCard
          key={product.id}
          product={product}
          locale={locale}
          specSchema={specSchema}
          priority={index < 4}
        />
      ))}
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="bg-card flex flex-col rounded-lg border">
          <Skeleton className="aspect-square rounded-b-none" />
          <div className="flex flex-col gap-2.5 p-3.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-5 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}
