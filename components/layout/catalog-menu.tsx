"use client";

import { ChevronDown, ChevronRight, LayoutGrid } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { CategoryIcon } from "@/components/layout/category-icon";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type CatalogCategory = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  icon?: string;
  children: { id: string; slug: string; name: string; count: number }[];
};

const PANEL_ID = "catalog-panel";

/**
 * Root categories live in a vertical rail that flies out from the left edge of
 * the page container. The panel overlays the page instead of occupying a grid
 * column, so catalogue pages keep their own left filter rail at full width.
 *
 * This is stateful rather than the CSS-only hover menu it replaces: a vertical
 * rail needs to know which root is hovered to decide what the second column
 * shows, and CSS alone cannot express that. Because opening is now driven by
 * focus and click as well as hover, the panel can be unmounted while closed —
 * keyboard users reach the subcategory links through the trigger, not by
 * tabbing across a bar of invisible panels.
 */
export function CatalogMenu({ categories }: { categories: CatalogCategory[] }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState(categories[0]?.id ?? "");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // The header renders in the layout, so it survives navigation: every link in
  // the panel closes it on click rather than reacting to the pathname, which
  // would mean setting state from an effect.
  const close = () => setOpen(false);

  // Both listeners are on the document because the panel opens on hover too:
  // with the pointer over it and focus still on the page behind, neither an
  // outside click nor Escape would reach a handler bound to the wrapper.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      // Only pull focus back if it was inside the panel — an Escape pressed
      // while typing in the search field must not steal the caret.
      if (wrapperRef.current?.contains(document.activeElement)) {
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const active = categories.find((c) => c.id === activeId) ?? categories[0];
  if (!active) return null;

  return (
    <div
      ref={wrapperRef}
      className="relative hidden lg:block"
      onPointerLeave={close}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={PANEL_ID}
        // Opens rather than toggles: a mouse click is always preceded by
        // `pointerenter`, so a toggle would open on the way in and close again
        // on the click itself. Dismissal is pointer-leave, Escape, or a click
        // outside.
        onClick={() => setOpen(true)}
        onPointerEnter={() => setOpen(true)}
        className="bg-brand-yellow text-brand-black hover:bg-brand-yellow-dark focus-visible:ring-brand-yellow inline-flex h-12 items-center gap-2 px-4 text-sm font-bold transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:outline-none"
      >
        <LayoutGrid aria-hidden className="size-4" />
        {t("nav.categories")}
        <ChevronDown
          aria-hidden
          className={cn("size-4 transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <div
          id={PANEL_ID}
          className="absolute top-full left-0 z-40 w-[min(62rem,calc(100vw-3rem))] pt-1"
        >
          <nav
            aria-label={t("nav.categories")}
            className="bg-popover text-popover-foreground grid grid-cols-[16rem_minmax(0,1fr)] overflow-hidden rounded-b-md border shadow-lg"
          >
            <ul className="bg-secondary/40 border-r py-2">
              {categories.map((root) => {
                const isActive = root.id === active.id;
                return (
                  <li key={root.id}>
                    <Link
                      href={`/c/${root.slug}`}
                      onPointerEnter={() => setActiveId(root.id)}
                      onFocus={() => setActiveId(root.id)}
                      onClick={close}
                      className={cn(
                        // The weight is uniform on purpose. Bolding the active
                        // row re-wraps long category names, which changes the
                        // row's height and shoves the rows below it out from
                        // under the pointer mid-travel.
                        "focus-visible:ring-ring flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
                        isActive
                          ? "bg-popover text-foreground border-brand-yellow -mr-px border-r-2"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <CategoryIcon
                        icon={root.icon}
                        className="size-4 shrink-0 opacity-70"
                      />
                      <span className="flex-1">{root.name}</span>
                      {root.children.length ? (
                        <ChevronRight aria-hidden className="size-4 opacity-40" />
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div
              className={cn(
                "grid gap-6 p-6",
                // A leaf root has nothing to list, so the summary card takes the
                // whole column instead of sitting beside an empty grid.
                active.children.length && "xl:grid-cols-[minmax(0,1fr)_16rem]",
              )}
            >
              {active.children.length ? (
                <div>
                  <p className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
                    {active.name}
                  </p>
                  <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                    {active.children.map((child) => (
                      <li key={child.id}>
                        <Link
                          href={`/c/${child.slug}`}
                          onClick={close}
                          className="hover:bg-secondary focus-visible:ring-ring flex w-fit items-baseline gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
                        >
                          <span>{child.name}</span>
                          <span className="text-data text-muted-foreground text-xs">
                            {child.count}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="bg-secondary/60 max-w-lg self-start rounded-md p-4">
                <p className="text-sm font-semibold">{active.name}</p>
                {active.description ? (
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                    {active.description}
                  </p>
                ) : null}
                <Link
                  href={`/c/${active.slug}`}
                  onClick={close}
                  className="text-primary mt-3 inline-block text-sm font-semibold hover:underline"
                >
                  {t("common.viewAll")} →
                </Link>
              </div>
            </div>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
