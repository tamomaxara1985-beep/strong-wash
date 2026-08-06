import type { ResolvedSpec } from "@/lib/specs";
import { cn } from "@/lib/utils";

/**
 * The card's signature element: the two or three figures that actually decide a
 * specification — throughput, vehicle envelope, power draw, pressure — set in
 * tabular mono so they line up down a grid column and can be compared without
 * opening each product.
 */
export function SpecStrip({
  specs,
  className,
}: {
  specs: ResolvedSpec[];
  className?: string;
}) {
  if (!specs.length) return null;

  return (
    <ul className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {specs.map((spec) => (
        <li
          key={spec.key}
          className="text-data bg-secondary text-secondary-foreground inline-flex h-5 items-center rounded-sm px-1.5 text-[11px] font-medium"
          title={`${spec.label}: ${spec.display}`}
        >
          <span className="sr-only">{spec.label}:</span>
          {spec.display}
        </li>
      ))}
    </ul>
  );
}
