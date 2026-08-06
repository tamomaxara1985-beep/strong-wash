import { useTranslations } from "next-intl";
import Image from "next/image";

import { DiscountBadge, PriceBlock } from "@/components/catalog/price-block";
import { SpecStrip } from "@/components/catalog/spec-strip";
import { StockBadge } from "@/components/catalog/stock-badge";
import { Link } from "@/i18n/navigation";
import { discountPercent, pickLocale } from "@/lib/localized";
import { getBrandById } from "@/lib/mock/brands";
import { getCardSpecs } from "@/lib/specs";
import type { Locale, Product } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ProductCard({
  product,
  locale,
  priority = false,
  className,
}: {
  product: Product;
  locale: Locale;
  priority?: boolean;
  className?: string;
}) {
  const t = useTranslations("common");
  const brand = getBrandById(product.brand);
  const name = pickLocale(product.name, locale);
  const percent = discountPercent(product.price, product.salePrice);
  const specs = getCardSpecs(product, locale, { yes: t("yes"), no: t("no") });
  const cover = product.images[0];

  return (
    <article
      className={cn(
        "group bg-card relative flex flex-col rounded-lg border transition-[border-color,box-shadow] duration-150",
        "hover:border-primary/60 hover:shadow-[0_1px_2px_rgba(11,31,51,0.04),0_8px_24px_-12px_rgba(11,31,51,0.18)]",
        "focus-within:border-primary/60",
        className,
      )}
    >
      <div className="bg-secondary/40 relative aspect-square overflow-hidden rounded-t-lg">
        <Image
          src={cover.url}
          alt={pickLocale(cover.alt, locale)}
          fill
          sizes="(min-width: 1280px) 20vw, (min-width: 768px) 30vw, 45vw"
          priority={priority}
          className="object-contain p-4 transition-transform duration-200 group-hover:scale-[1.03]"
        />
        {percent > 0 ? (
          <DiscountBadge percent={percent} className="absolute left-2 top-2" />
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-3.5">
        {brand ? (
          <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
            {brand.name}
          </p>
        ) : null}

        <h3 className="text-sm leading-snug font-semibold">
          {/* The whole card is clickable via this stretched link, so the grid
              needs no nested interactive elements. */}
          <Link
            href={`/p/${product.slug}`}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {name}
          </Link>
        </h3>

        <SpecStrip specs={specs} />

        <div className="mt-auto flex flex-col gap-1.5 pt-1">
          <PriceBlock
            price={product.price}
            salePrice={product.salePrice}
            locale={locale}
          />
          <StockBadge status={product.stockStatus} />
        </div>
      </div>
    </article>
  );
}
