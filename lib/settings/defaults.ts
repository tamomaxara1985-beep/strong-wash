export type ResolvedSettings = {
  brandYellow: string;
  brandBlack: string;
  fontKey: string;
};

/**
 * What the site looks like with no settings row.
 *
 * The settings document is read in the root layout, so it is on the path of
 * every page: a first deploy against an empty database, a deleted document or an
 * unreachable Atlas must all degrade to the site as it shipped, not to a blank
 * one. Keeping the fallbacks in one constant is what makes that claim checkable —
 * the alternative is a `??` in every consumer, and one of them will be missed.
 *
 * Contact details used to live here. They moved to `lib/locations/defaults.ts`
 * when the site gained several branches — a single phone and address could not
 * describe more than one.
 */
export const DEFAULT_SETTINGS: ResolvedSettings = {
  brandYellow: "#fec303",
  brandBlack: "#010101",
  fontKey: "manrope",
};
