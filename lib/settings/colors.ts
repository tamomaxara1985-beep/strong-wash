/**
 * Colour maths for the admin theme fields.
 *
 * Pure functions, no database and no React, because both the API route and the
 * form need them and neither should reach into the other.
 */

export const HEX = /^#[0-9a-fA-F]{6}$/;

function channels(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function toHex(channel: number): string {
  return Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0");
}

/** WCAG 2.1 relative luminance. The 0.03928 kink is the sRGB transfer curve. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/** Moves a colour toward black (negative) or white (positive). */
export function shade(hex: string, amount: number): string {
  const target = amount < 0 ? 0 : 255;
  const weight = Math.abs(amount);
  const [r, g, b] = channels(hex);
  return `#${toHex(r + (target - r) * weight)}${toHex(g + (target - g) * weight)}${toHex(b + (target - b) * weight)}`;
}

/**
 * The hover shade, derived rather than stored.
 *
 * globals.css hand-tuned #fec303 to #e0a800 for light and #ffd23f for dark; these
 * weights reproduce that relationship for any brand colour. A third input for a
 * hover shade would be a field nobody could reason about.
 */
export function derivedShades(brandYellow: string): { light: string; dark: string } {
  return { light: shade(brandYellow, -0.12), dark: shade(brandYellow, 0.16) };
}
