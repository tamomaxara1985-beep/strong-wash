"use client";

import { ChevronRight, Menu, Phone, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { SearchForm } from "@/components/layout/search-form";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Link } from "@/i18n/navigation";

export type NavCategory = {
  id: string;
  slug: string;
  name: string;
  children: { id: string; slug: string; name: string; count: number }[];
};

export function MobileNav({
  categories,
  phone,
  phone2,
  signedIn = false,
}: {
  categories: NavCategory[];
  phone: string;
  phone2?: string;
  signedIn?: boolean;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label={t("nav.openMenu")}
        className="text-foreground hover:bg-secondary focus-visible:ring-ring inline-flex size-10 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none lg:hidden"
      >
        <Menu aria-hidden className="size-5" />
      </SheetTrigger>

      <SheetContent side="left" className="w-[min(22rem,90vw)] p-0">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="text-base">{t("nav.menu")}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4">
          <SearchForm onSubmitted={close} />

          <Accordion type="multiple" className="w-full">
            {categories.map((category) =>
              category.children.length ? (
                <AccordionItem key={category.id} value={category.id}>
                  <AccordionTrigger className="py-3 text-sm font-semibold hover:no-underline">
                    {category.name}
                  </AccordionTrigger>
                  <AccordionContent className="pb-2">
                    <ul className="flex flex-col">
                      <li>
                        <Link
                          href={`/c/${category.slug}`}
                          onClick={close}
                          className="text-primary hover:bg-secondary flex items-center justify-between rounded-sm px-2 py-2 text-sm font-semibold"
                        >
                          {t("nav.allCategories")}
                          <ChevronRight aria-hidden className="size-4" />
                        </Link>
                      </li>
                      {category.children.map((child) => (
                        <li key={child.id}>
                          <Link
                            href={`/c/${child.slug}`}
                            onClick={close}
                            className="hover:bg-secondary flex items-center justify-between gap-2 rounded-sm px-2 py-2 text-sm"
                          >
                            {child.name}
                            <span className="text-data text-muted-foreground text-xs">
                              {child.count}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              ) : (
                <div key={category.id} className="border-b">
                  <Link
                    href={`/c/${category.slug}`}
                    onClick={close}
                    className="flex items-center justify-between py-3 text-sm font-semibold"
                  >
                    {category.name}
                    <ChevronRight aria-hidden className="size-4 opacity-50" />
                  </Link>
                </div>
              ),
            )}
          </Accordion>

          {/* The desktop bar's account controls have no room on mobile, so the
              sheet carries them. */}
          <div className="flex flex-col gap-1 border-t pt-4">
            {signedIn ? (
              <Link
                href="/account"
                onClick={close}
                className="hover:bg-secondary flex items-center gap-2 rounded-sm px-2 py-2 text-sm font-semibold"
              >
                <UserRound aria-hidden className="size-4" />
                {t("auth.account")}
              </Link>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  onClick={close}
                  className="hover:bg-secondary flex items-center gap-2 rounded-sm px-2 py-2 text-sm font-semibold"
                >
                  <UserRound aria-hidden className="size-4" />
                  {t("auth.signIn")}
                </Link>
                <Link
                  href="/sign-up"
                  onClick={close}
                  className="text-primary hover:bg-secondary flex items-center gap-2 rounded-sm px-2 py-2 text-sm font-semibold"
                >
                  {t("auth.signUp")}
                </Link>
              </>
            )}
          </div>

          {/* The switcher stays level with the first number rather than centred
              on the pair, so a branch with two numbers does not shift a control
              that sits in the same place on every other page. */}
          <div className="flex items-start justify-between border-t pt-4">
            <div className="flex flex-col gap-1.5">
              <a
                href={`tel:${phone.replace(/\s/g, "")}`}
                className="inline-flex items-center gap-2 text-sm font-semibold"
              >
                <Phone aria-hidden className="size-4" />
                {phone}
              </a>
              {phone2 ? (
                <a
                  href={`tel:${phone2.replace(/\s/g, "")}`}
                  className="inline-flex items-center gap-2 text-sm font-semibold"
                >
                  <Phone aria-hidden className="size-4" />
                  {phone2}
                </a>
              ) : null}
            </div>
            <LocaleSwitcher />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
