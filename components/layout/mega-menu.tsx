import { getTranslations } from "next-intl/server";

import { CategoryIcon } from "@/components/layout/category-icon";
import { Link } from "@/i18n/navigation";
import { pickLocale } from "@/lib/localized";
import { getCategoryTree } from "@/lib/mock/categories";
import { countProductsInCategory } from "@/lib/queries/products";
import type { Locale } from "@/lib/types";

/**
 * The panel opens on hover and on focus-within. Keeping the panel at
 * `opacity-0` rather than `hidden` is deliberate: hidden and
 * `visibility: hidden` subtrees are not focusable, so a keyboard user tabbing
 * along the bar would skip every subcategory link. At zero opacity the links
 * stay in the tab order and the first Tab into the panel reveals it.
 */
export async function MegaMenu({ locale }: { locale: Locale }) {
  const t = await getTranslations("common");
  const tree = getCategoryTree();

  return (
    <nav aria-label={t("brand")} className="hidden lg:block">
      <ul className="flex items-stretch">
        {tree.map((root) => {
          const hasChildren = root.children.length > 0;
          return (
            <li key={root.id} className="group static">
              <Link
                href={`/c/${root.slug}`}
                className="hover:text-brand-yellow group-hover:border-brand-yellow group-focus-within:border-brand-yellow focus-visible:ring-brand-yellow inline-flex h-11 items-center gap-2 border-b-[3px] border-transparent px-3.5 text-sm font-semibold text-white/90 transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                <CategoryIcon icon={root.icon} className="size-4 opacity-80" />
                {pickLocale(root.name, locale)}
              </Link>

              {hasChildren ? (
                <div className="pointer-events-none absolute inset-x-0 top-full z-40 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                  <div className="bg-popover text-popover-foreground border-t shadow-lg">
                    <div className="container-page grid gap-6 py-6 lg:grid-cols-[1fr_18rem]">
                      <div>
                        <p className="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wide">
                          {pickLocale(root.name, locale)}
                        </p>
                        <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                          {root.children.map((child) => (
                            <li key={child.id}>
                              <Link
                                href={`/c/${child.slug}`}
                                className="hover:bg-secondary focus-visible:ring-ring flex w-fit items-baseline gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
                              >
                                <span>{pickLocale(child.name, locale)}</span>
                                <span className="text-data text-muted-foreground text-xs">
                                  {countProductsInCategory(child.slug)}
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="bg-secondary/60 hidden rounded-md p-4 lg:block">
                        <p className="text-sm font-semibold">
                          {pickLocale(root.name, locale)}
                        </p>
                        {root.description ? (
                          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                            {pickLocale(root.description, locale)}
                          </p>
                        ) : null}
                        <Link
                          href={`/c/${root.slug}`}
                          className="text-primary mt-3 inline-block text-sm font-semibold hover:underline"
                        >
                          {t("viewAll")} →
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
