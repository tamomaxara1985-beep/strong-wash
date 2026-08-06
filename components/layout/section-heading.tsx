import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function SectionHeading({
  title,
  href,
  linkLabel,
  className,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex items-end justify-between gap-4", className)}>
      <h2 className="text-display text-xl sm:text-2xl">{title}</h2>
      {href && linkLabel ? (
        <Link
          href={href}
          className="text-primary shrink-0 text-sm font-semibold hover:underline"
        >
          {linkLabel} →
        </Link>
      ) : null}
    </div>
  );
}
