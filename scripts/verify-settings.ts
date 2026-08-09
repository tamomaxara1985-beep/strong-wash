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
    // `getSiteSettings()` returns `DEFAULT_SETTINGS` BY REFERENCE when no document
    // exists, so comparing `empty` against `DEFAULT_SETTINGS` by JSON would just
    // compare the object with itself and pass for any implementation. Specific
    // expected values are asserted instead.
    check("with no document, phone matches the default", empty.phone === "+995 322 40 40 40");
    check("with no document, brandYellow matches the default", empty.brandYellow === "#fec303");
    check("with no document, brandBlack matches the default", empty.brandBlack === "#010101");
    check("with no document, fontKey matches the default", empty.fontKey === "manrope");
    check(
      "with no document, the localized address matches the default",
      empty.address.ka === "თბილისი, ქ. წერეთლის გამზ. 116" &&
        empty.address.en === "116 Ts. Tsereteli Ave, Tbilisi" &&
        empty.address.ru === "Тбилиси, пр. Ц. Церетели 116",
    );

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
    // THE RULE: an unset locale falls back to the admin's own stored `ka` when
    // there is one — matching `pickLocale`'s contract everywhere else in this
    // codebase — and only to the default when the admin has stored nothing at
    // all. Falling back to the default per-locale would leave `/en` and `/ru`
    // serving stale data forever after a Georgian-only edit.
    check("an unset en falls back to the admin's stored ka, not the default en", partial.address.en === "ტესტი");
    check("an unset ru falls back to the admin's stored ka, not the default ru", partial.address.ru === "ტესტი");

    // The stored `address` subdocument itself absent entirely — not merely an
    // unset locale within it — is the "admin has stored nothing at all" case
    // the new rule still has to default on.
    await SiteSettings.updateOne({ _id: SETTINGS_ID }, { $unset: { address: "" } });
    const nothingStored = await (await import("../lib/queries/settings")).getSiteSettings();
    check(
      "the default still wins when the stored object is absent entirely",
      nothingStored.address.ka === DEFAULT_SETTINGS.address.ka &&
        nothingStored.address.en === DEFAULT_SETTINGS.address.en &&
        nothingStored.address.ru === DEFAULT_SETTINGS.address.ru,
    );

    await SiteSettings.updateOne({ _id: SETTINGS_ID }, { $set: { phone: "+995 111" } }, { upsert: true });
    check("saving twice upserts rather than duplicating", (await SiteSettings.countDocuments({})) === 1);

    // A document written outside the app — `mongosh`, a restored dump, a future
    // second writer — is not shaped by the Zod schema. Bypassing the model and
    // writing through the raw driver collection reproduces that: Mongoose's own
    // `updateOne`/`create` would cast or reject these values before they ever hit
    // the database.
    await SiteSettings.deleteOne({ _id: SETTINGS_ID });
    await SiteSettings.collection.insertOne({
      _id: SETTINGS_ID,
      brandYellow: 123,
      address: "not an object",
    } as never);
    const malformed = await (await import("../lib/queries/settings")).getSiteSettings();
    check(
      "a malformed stored document returns usable defaults rather than throwing",
      malformed.phone === DEFAULT_SETTINGS.phone && malformed.brandYellow === DEFAULT_SETTINGS.brandYellow,
    );
    await SiteSettings.deleteOne({ _id: SETTINGS_ID });

    const { HEX, contrastRatio, derivedShades, shade } = await import("../lib/settings/colors");

    check("the default yellow carries black text", contrastRatio("#fec303", "#101010") >= 4.5);
    check("a mid grey does not", contrastRatio("#767676", "#101010") < 4.5);
    check("black on white is the maximum", Math.round(contrastRatio("#000000", "#ffffff")) === 21);
    check("contrast is symmetric", contrastRatio("#fec303", "#101010") === contrastRatio("#101010", "#fec303"));
    check("darkening moves toward black", shade("#fec303", -0.12) < "#fec303");
    check("the derived light shade is exactly what the current weight produces", derivedShades("#fec303").light === "#e0ac03");
    check("the derived dark shade is exactly what the current weight produces", derivedShades("#fec303").dark === "#fecd2b");
    check(
      "a channel swap in shade()'s return template would be caught: pure red stays red",
      derivedShades("#ff0000").light === "#e00000",
    );

    for (const bad of ["red", "#ff0", "#GGGGGG", "#fff);body{display:none", "fec303"]) {
      check(`the hex regex refuses ${JSON.stringify(bad)}`, !HEX.test(bad));
    }
    check("the hex regex accepts #fec303", HEX.test("#fec303"));

    const { FONT_KEYS, findFont } = await import("../lib/settings/fonts");
    check("the default font key is in the allowlist", FONT_KEYS.includes("manrope"));
    check("an unknown key falls back rather than throwing", findFont("no-such-font").key === FONT_KEYS[0]);

    // `getSiteSettings` is called from the root layout, so a query failure must
    // not propagate and take the whole site down with it — it has to degrade to
    // the defaults instead. Run this last and stub `findById` rather than
    // actually severing the connection, so every check above still has a
    // working database to run against.
    const originalFindById = SiteSettings.findById.bind(SiteSettings);
    // Deliberately returning a shape narrower than Mongoose's real query
    // builder; only `.lean()` is ever called on the result here, so the rest
    // of the interface is irrelevant to what this simulates.
    SiteSettings.findById = (() => ({
      lean: () => Promise.reject(new Error("simulated query failure")),
    })) as unknown as typeof SiteSettings.findById;
    try {
      const onFailure = await (await import("../lib/queries/settings")).getSiteSettings();
      check(
        "getSiteSettings returns defaults rather than throwing when the query fails",
        onFailure.phone === DEFAULT_SETTINGS.phone && onFailure.brandYellow === DEFAULT_SETTINGS.brandYellow,
      );
    } finally {
      SiteSettings.findById = originalFindById;
    }
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
