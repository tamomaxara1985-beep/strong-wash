import { useTranslations } from "next-intl";

import type { StockStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STYLES: Record<StockStatus, string> = {
  in_stock: "text-stock-in",
  low: "text-stock-low",
  out: "text-stock-out",
  preorder: "text-primary",
};

const LABEL_KEYS: Record<StockStatus, "inStock" | "lowStock" | "outOfStock" | "preorder"> = {
  in_stock: "inStock",
  low: "lowStock",
  out: "outOfStock",
  preorder: "preorder",
};

export function StockBadge({
  status,
  className,
}: {
  status: StockStatus;
  className?: string;
}) {
  const t = useTranslations("product");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        STYLES[status],
        className,
      )}
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full bg-current"
      />
      {t(LABEL_KEYS[status])}
    </span>
  );
}
