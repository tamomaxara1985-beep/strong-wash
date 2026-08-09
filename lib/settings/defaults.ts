import type { LocalizedString } from "../types";

export type ResolvedSettings = {
  phone: string;
  /** Empty means the footer renders no email row at all. */
  email: string;
  address: LocalizedString;
  workHours: LocalizedString;
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
 */
export const DEFAULT_SETTINGS: ResolvedSettings = {
  phone: "+995 322 40 40 40",
  email: "",
  address: {
    ka: "თბილისი, ქ. წერეთლის გამზ. 116",
    en: "116 Ts. Tsereteli Ave, Tbilisi",
    ru: "Тбилиси, пр. Ц. Церетели 116",
  },
  workHours: {
    ka: "ორშ–შაბ 10:00–18:00",
    en: "Mon–Sat 10:00–18:00",
    ru: "Пн–Сб 10:00–18:00",
  },
  brandYellow: "#fec303",
  brandBlack: "#010101",
  fontKey: "manrope",
};
