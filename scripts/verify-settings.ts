/**
 * DB-level checks for site settings.
 *
 * Run with `npm run verify:settings`. It writes to whatever MONGODB_URI points
 * at, like the seed script. The settings document is a singleton with a fixed
 * id, so this script SAVES AND RESTORES the real one rather than using a
 * prefixed fixture: it snapshots the document first and puts it back in the
 * `finally`, including when an assertion throws.
 */
import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";

import { SETTINGS_ID, SiteSettings } from "../lib/models/site-settings";
import { DEFAULT_SETTINGS } from "../lib/settings/defaults";

loadEnvConfig(process.cwd());

let passed = 0;

function check(label: string, condition: boolean) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  passed += 1;
  console.log(`  ok  ${label}`);
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);

  const snapshot = await SiteSettings.findById(SETTINGS_ID).lean();

  try {
    await SiteSettings.deleteOne({ _id: SETTINGS_ID });

    const { getSiteSettings } = await import("../lib/queries/settings");
    const empty = await getSiteSettings();
    check("with no document, every field is populated", Boolean(empty.phone && empty.brandYellow && empty.fontKey));
    check("and it equals DEFAULT_SETTINGS", JSON.stringify(empty) === JSON.stringify(DEFAULT_SETTINGS));

    await SiteSettings.updateOne(
      { _id: SETTINGS_ID },
      { $set: { phone: "+995 000 00 00 00", address: { ka: "ტესტი" } } },
      { upsert: true },
    );

    // `cache()` memoises per React request scope; in a plain script each call
    // re-reads, which is what the next assertion depends on.
    const partial = await (await import("../lib/queries/settings")).getSiteSettings();
    check("a stored field wins", partial.phone === "+995 000 00 00 00");
    check("an unset field still falls back", partial.brandYellow === DEFAULT_SETTINGS.brandYellow);
    check("a stored ka wins for ka", partial.address.ka === "ტესტი");
    check("an unset en falls back to the default en", partial.address.en === DEFAULT_SETTINGS.address.en);

    await SiteSettings.updateOne({ _id: SETTINGS_ID }, { $set: { phone: "+995 111" } }, { upsert: true });
    check("saving twice upserts rather than duplicating", (await SiteSettings.countDocuments({})) === 1);
  } finally {
    await SiteSettings.deleteOne({ _id: SETTINGS_ID });
    if (snapshot) {
      const { _id, ...rest } = snapshot;
      await SiteSettings.create({ _id, ...rest });
    }
    await mongoose.disconnect();
  }

  console.log(`\n${passed} checks passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
