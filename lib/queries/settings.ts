import { cache } from "react";

import { connectToDatabase } from "../db";
import { SETTINGS_ID, SiteSettings } from "../models/site-settings";
import { DEFAULT_SETTINGS, type ResolvedSettings } from "../settings/defaults";
import type { LocalizedString } from "../types";

/**
 * A stored localized value wins only for the locales it actually fills in.
 *
 * An unset locale falls back to the admin's own stored `ka` when there is
 * one — the same contract `pickLocale` uses everywhere else in this
 * codebase — and only to the default when the admin has stored nothing at
 * all. Falling back to the default per-locale instead would mean editing
 * only the Georgian address leaves `/en` and `/ru` serving the previous
 * address indefinitely: wrong data, not a missing translation.
 */
function mergeLocalized(
  stored: { ka?: string | null; en?: string | null; ru?: string | null } | null | undefined,
  fallback: LocalizedString,
): LocalizedString {
  const storedKa = stored?.ka?.trim();
  const ka = storedKa || fallback.ka;
  return {
    ka,
    en: stored?.en?.trim() || (storedKa ? ka : fallback.en),
    ru: stored?.ru?.trim() || (storedKa ? ka : fallback.ru),
  };
}

/**
 * The whole settings document, merged over the defaults.
 *
 * `cache()` collapses the layout's, header's, footer's and product page's reads
 * into one query per request. There is deliberately no Next data-cache tag: the
 * document is a handful of fields fetched by primary key, and a theme that stays
 * stale after a save would be a worse failure than one extra query per render.
 *
 * It never throws. It is called from the root layout, so an error propagating out
 * of here takes down every page on the site rather than one component.
 */
export const getSiteSettings = cache(async (): Promise<ResolvedSettings> => {
  try {
    await connectToDatabase();
    const doc = await SiteSettings.findById(SETTINGS_ID).lean();
    if (!doc) return DEFAULT_SETTINGS;

    return {
      phone: doc.phone?.trim() || DEFAULT_SETTINGS.phone,
      email: doc.email?.trim() || DEFAULT_SETTINGS.email,
      address: mergeLocalized(doc.address, DEFAULT_SETTINGS.address),
      workHours: mergeLocalized(doc.workHours, DEFAULT_SETTINGS.workHours),
      brandYellow: doc.brandYellow?.trim() || DEFAULT_SETTINGS.brandYellow,
      brandBlack: doc.brandBlack?.trim() || DEFAULT_SETTINGS.brandBlack,
      fontKey: doc.fontKey?.trim() || DEFAULT_SETTINGS.fontKey,
    };
  } catch (error) {
    console.error("[settings] falling back to defaults", error);
    return DEFAULT_SETTINGS;
  }
});
