import type { StoreLocation } from "../types";

/**
 * The one branch the site shows when nothing is stored.
 *
 * Same role `DEFAULT_SETTINGS` plays for the theme: a first deploy, an empty
 * collection or an unreachable Atlas must degrade to the site as it shipped, not
 * to a page with no telephone number on it. It is also why this feature needs no
 * migration — the values being "moved" out of settings were always constants.
 *
 * `id` is a sentinel, not an ObjectId: nothing may try to edit or delete this.
 */
export const DEFAULT_LOCATION: StoreLocation = {
  id: "default",
  name: {
    ka: "თბილისი",
    en: "Tbilisi",
    ru: "Тбилиси",
  },
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
  order: 0,
  isActive: true,
};
