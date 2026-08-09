import { HEX, derivedShades } from "@/lib/settings/colors";
import { DEFAULT_SETTINGS, type ResolvedSettings } from "@/lib/settings/defaults";
import { findFont } from "@/lib/settings/fonts";

/**
 * The admin's overrides, as CSS variables.
 *
 * Only what differs from the defaults is emitted, so an untouched site ships no
 * extra bytes and globals.css stays the single description of the theme.
 *
 * It renders in <head> and inline, which is the point: a stylesheet request or a
 * client effect would both paint the default palette first and then correct it.
 *
 * The API already restricts these to `#rrggbb` and to a key from the font
 * allowlist, so nothing in-app can reach this with an unsafe value — but this
 * component is in the root layout, on every page, and `dangerouslySetInnerHTML`
 * is the injection point. A value written by `mongosh`, a restored dump, or a
 * future second writer would escape the element on save, so `HEX.test(...)` is
 * required here too rather than trusted from the schema at the other end.
 */
export function SettingsStyle({ settings }: { settings: ResolvedSettings }) {
  const declarations: string[] = [];
  const darkDeclarations: string[] = [];

  if (
    HEX.test(settings.brandYellow) &&
    settings.brandYellow.toLowerCase() !== DEFAULT_SETTINGS.brandYellow.toLowerCase()
  ) {
    const shades = derivedShades(settings.brandYellow);
    declarations.push(`--brand-yellow:${settings.brandYellow}`, `--brand-yellow-dark:${shades.light}`);
    darkDeclarations.push(`--brand-yellow:${settings.brandYellow}`, `--brand-yellow-dark:${shades.dark}`);
  }

  if (
    HEX.test(settings.brandBlack) &&
    settings.brandBlack.toLowerCase() !== DEFAULT_SETTINGS.brandBlack.toLowerCase()
  ) {
    declarations.push(`--brand-black:${settings.brandBlack}`);
    darkDeclarations.push(`--brand-black:${settings.brandBlack}`);
  }

  if (settings.fontKey !== DEFAULT_SETTINGS.fontKey) {
    declarations.push(`--font-body:var(${findFont(settings.fontKey).variable})`);
  }

  if (!declarations.length && !darkDeclarations.length) return null;

  const css = [
    declarations.length ? `:root{${declarations.join(";")}}` : "",
    // Dark mode is dormant today — nothing applies the .dark class yet. Emitted
    // so the override is already correct when it is switched on.
    darkDeclarations.length ? `.dark{${darkDeclarations.join(";")}}` : "",
  ].join("");

  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
