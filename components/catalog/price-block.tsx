import { Lari } from "@/components/ui/lari";
import { discountPercent, formatAmount, formatPriceText } from "@/lib/localized";
import type { Locale } from "@/lib/types";
import { cn } from "@/lib/utils";

export function DiscountBadge({
  percent,
  className,
}: {
  percent: number;
  className?: string;
}) {
  if (percent <= 0) return null;
  return (
    <span
      className={cn(
        "text-data bg-sale text-sale-foreground inline-flex h-6 items-center rounded-sm px-1.5 text-xs font-bold",
        className,
      )}
    >
      −{percent}%
    </span>
  );
}

/**
 * Prices are always set in near-black. The brand yellow cannot carry legible
 * text on a light surface, so a discount is signalled by the yellow badge and
 * the struck-through original rather than by recolouring the number.
 */
export function PriceBlock({
  price,
  salePrice,
  locale,
  size = "md",
  className,
}: {
  price: number;
  salePrice: number | null;
  locale: Locale;
  size?: "md" | "lg";
  className?: string;
}) {
  const percent = discountPercent(price, salePrice);
  const onSale = percent > 0;
  const effective = onSale ? (salePrice as number) : price;

  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-2 gap-y-1", className)}>
      <span
        className={cn(
          "text-data text-foreground font-bold tracking-tight",
          size === "lg" ? "text-3xl" : "text-lg",
        )}
      >
        <span aria-hidden>
          {formatAmount(effective, locale)}
          <Lari className="ml-1" />
        </span>
        {/* The visual price is split across an element, so the accessible name
            is supplied as plain text. */}
        <span className="sr-only">{formatPriceText(effective, locale)}</span>
      </span>
      {onSale ? (
        <span
          className={cn(
            "text-data text-muted-foreground line-through",
            size === "lg" ? "text-base" : "text-sm",
          )}
        >
          <span aria-hidden>
            {formatAmount(price, locale)}
            <Lari className="ml-0.5" />
          </span>
          <span className="sr-only">{formatPriceText(price, locale)}</span>
        </span>
      ) : null}
    </div>
  );
}
