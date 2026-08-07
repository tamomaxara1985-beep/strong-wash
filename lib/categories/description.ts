import type { LocalizedString } from "../types";

/**
 * Normalises an optional localized description into what the model accepts.
 *
 * `localizedStringSchema` requires `ka`, because `pickLocale` falls back to it —
 * a subdocument with only `en` would render blank for Georgian visitors. A
 * description with no Georgian text is therefore stored as no description at all
 * rather than as a half-populated object.
 */
export function normaliseDescription(
  value: { ka?: string; en?: string; ru?: string } | undefined,
): LocalizedString | undefined {
  const ka = value?.ka?.trim();
  if (!ka) return undefined;
  return {
    ka,
    en: value?.en?.trim() || undefined,
    ru: value?.ru?.trim() || undefined,
  };
}
