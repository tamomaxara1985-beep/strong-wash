/**
 * The Georgian lari sign (₾, U+20BE) as an outline rather than a character.
 *
 * No Google webfont ships a unicode-range covering U+20BE, and the sign is
 * absent from the system fonts on common Windows installs — Chrome then falls
 * back to an emoji font and renders an unrelated pictograph where the currency
 * should be. Drawing the glyph removes that dependency entirely.
 *
 * Outline extracted from Noto Sans Regular (SIL Open Font License 1.1), scaled
 * to a 1000-unit em square. Generated — do not hand-edit the path.
 */
import { cn } from "@/lib/utils";

const VIEW_BOX = "55 -815 529 815";
const PATH = "M55 0L55-78L245-78Q168-118 117-194Q66-270 66-382Q66-511 122.50-595Q179-679 288-704L288-815L348-815L348-713Q365-714 383-714Q406-714 428-713L428-815L488-815L488-706Q529-698 568-684L568-607Q527-621 488-628L488-413L428-413L428-635Q412-636 396-636Q371-636 348-633L348-413L288-413L288-618Q155-566 155-377Q155-290 191.50-222.50Q228-155 294.50-116.50Q361-78 451-78L584-78L584 0";

export function Lari({ className }: { className?: string }) {
  return (
    <svg
      viewBox={VIEW_BOX}
      role="img"
      aria-label="GEL"
      focusable="false"
      className={cn("inline-block shrink-0 align-baseline", className)}
      style={{ height: "0.815em", width: "0.5290em" }}
    >
      <path d={PATH} fill="currentColor" />
    </svg>
  );
}
