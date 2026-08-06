import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * The supplied brand artwork, used unmodified. The mark is two flat colours —
 * #fec303 and #010101 — so on dark surfaces the black half would disappear;
 * `tone="inverse"` swaps in the variant where the black ink is remapped to
 * white and the yellow is left alone.
 *
 * Intrinsic sizes come from the trimmed assets: mark 512×175, lockup 1024×413.
 */
const ASSETS = {
  mark: {
    light: { src: "/brand/logo-mark.png", w: 512, h: 175 },
    inverse: { src: "/brand/logo-mark-inverse.png", w: 512, h: 175 },
  },
  lockup: {
    light: { src: "/brand/logo-lockup.png", w: 1024, h: 413 },
    inverse: { src: "/brand/logo-lockup-inverse.png", w: 1024, h: 413 },
  },
} as const;

export function BrandLogo({
  variant = "mark",
  tone = "light",
  className,
  alt,
  priority = false,
}: {
  variant?: "mark" | "lockup";
  tone?: "light" | "inverse";
  className?: string;
  /** Empty when the logo sits next to the brand name in text. */
  alt: string;
  priority?: boolean;
}) {
  const asset = ASSETS[variant][tone];

  return (
    <Image
      src={asset.src}
      width={asset.w}
      height={asset.h}
      alt={alt}
      priority={priority}
      className={cn("h-auto w-auto object-contain", className)}
    />
  );
}
