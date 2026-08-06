import {
  Bubbles,
  CarFront,
  Fan,
  FlaskConical,
  Gauge,
  Package,
  SprayCan,
  Waves,
  Wind,
  Wrench,
} from "lucide-react";

// Every root category needs a visually distinct glyph — reusing one across two
// top-level entries makes the nav bar unreadable at a glance.
const ICONS = {
  gantry: CarFront,
  bay: SprayCan,
  pressure: Gauge,
  vacuum: Wind,
  water: Waves,
  chemical: FlaskConical,
  foam: Bubbles,
  dryer: Fan,
  parts: Wrench,
} as const;

export function CategoryIcon({
  icon,
  className,
}: {
  icon?: string;
  className?: string;
}) {
  const Component = (icon && ICONS[icon as keyof typeof ICONS]) || Package;
  return <Component aria-hidden className={className} />;
}
