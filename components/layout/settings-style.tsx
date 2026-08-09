import { derivedShades } from "@/lib/settings/colors";
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
 * The values are safe to interpolate because the schema already restricted them
 * to `#rrggbb` and to a key from the font allowlist — there is no path here for a
 * value that could close the declaration.
 */
export function SettingsStyle({ settings }: { settings: ResolvedSettings }) {
  const declarations: string[] = [];
  const darkDeclarations: string[] = [];

  if (settings.brandYellow !== DEFAULT_SETTINGS.brandYellow) {
    const shades = derivedShades(settings.brandYellow);
    declarations.push(`--brand-yellow:${settings.brandYellow}`, `--brand-yellow-dark:${shades.light}`);
    darkDeclarations.push(`--brand-yellow:${settings.brandYellow}`, `--brand-yellow-dark:${shades.dark}`);
  }

  if (settings.brandBlack !== DEFAULT_SETTINGS.brandBlack) {
    declarations.push(`--brand-black:${settings.brandBlack}`);
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
