import { cache } from "react";

import { connectToDatabase } from "../db";
import { SETTINGS_ID, SiteSettings } from "../models/site-settings";
import { DEFAULT_SETTINGS, type ResolvedSettings } from "../settings/defaults";

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
      brandYellow: doc.brandYellow?.trim() || DEFAULT_SETTINGS.brandYellow,
      brandBlack: doc.brandBlack?.trim() || DEFAULT_SETTINGS.brandBlack,
      fontKey: doc.fontKey?.trim() || DEFAULT_SETTINGS.fontKey,
    };
  } catch (error) {
    console.error("[settings] falling back to defaults", error);
    return DEFAULT_SETTINGS;
  }
});
