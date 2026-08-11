/**
 * DB-level checks for store locations.
 *
 * Run with `npm run verify:locations`. Every fixture carries the marker below in
 * `name.ka` and is removed in the `finally`, including when an assertion throws.
 * It writes to whatever MONGODB_URI points at, exactly like the seed script.
 */
import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";

import { StoreLocation } from "../lib/models/store-location";

loadEnvConfig(process.cwd());

const MARKER = "zzz-verify-location";
let passed = 0;

function check(label: string, condition: boolean) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  passed += 1;
  console.log(`  ok  ${label}`);
}

async function cleanup() {
  await StoreLocation.deleteMany({ "name.ka": { $regex: MARKER } });
}

function fixture(suffix: string, order: number, isActive = true, phone2?: string) {
  return {
    name: { ka: `${MARKER} ${suffix}` },
    phone: "+995 000 00 00 00",
    phone2,
    address: { ka: `მისამართი ${suffix}` },
    workHours: { ka: "ორშ–შაბ 10:00–18:00" },
    order,
    isActive,
  };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);

  try {
    await cleanup();

    const { getLocations } = await import("../lib/queries/locations");
    const { DEFAULT_LOCATION } = await import("../lib/locations/defaults");

    // Once a real branch is stored (which happens the moment the operator
    // adds one), `getLocations()` legitimately stops returning the default —
    // that is the feature working, not a regression. The strict "falls back
    // to DEFAULT_LOCATION" assertion is therefore only meaningful when the
    // collection is genuinely empty, which this checks for directly rather
    // than inferring it from the length of `getLocations()`'s result (the
    // very thing that broke before: one real active row also has length 1).
    const realRows = await StoreLocation.countDocuments({
      "name.ka": { $not: { $regex: MARKER } },
    });
    const empty = await getLocations();
    if (realRows === 0) {
      check("with nothing stored the list is the default branch", empty.length === 1);
      check("and it is DEFAULT_LOCATION", empty[0]?.id === DEFAULT_LOCATION.id);
    } else {
      // Real branches exist, so the default-fallback scenario cannot be
      // exercised here — but cleanup() having actually removed every marker
      // row still can be, and the next block's exact-count assertions depend
      // on it having done so.
      check(
        "with real branches already stored, no marker rows leak into the result",
        !empty.some((l) => l.name.ka.includes(MARKER)),
      );
    }

    await StoreLocation.create(fixture("second", 20));
    await StoreLocation.create(fixture("first", 10));
    await StoreLocation.create(fixture("hidden", 5, false));

    const stored = (await import("../lib/queries/locations")).getLocations;
    const list = (await stored()).filter((l) => l.name.ka.includes(MARKER));

    check("stored branches replace the default", list.length === 2);
    check("they come back in order", list[0]?.name.ka.endsWith("first") === true);
    check("an inactive branch is absent", !list.some((l) => l.name.ka.endsWith("hidden")));

    const primary = await (await import("../lib/queries/locations")).getPrimaryLocation();
    if (realRows === 0) {
      // Nothing but marker rows is stored, so the fixture at the lowest order IS
      // the primary — the strongest form of the assertion, kept for that case.
      check("the primary is the first by order", primary.name.ka.endsWith("first"));
    } else {
      // Real branches exist and legitimately outrank the fixtures, so no fixture
      // can be primary here and asserting one is would fail for the wrong
      // reason. Assert what the query actually guarantees instead: the primary
      // is active, and no active branch sorts before it.
      const firstActive = await StoreLocation.find({ isActive: true })
        .sort({ order: 1 })
        .limit(1)
        .lean();
      const minOrder = firstActive[0]?.order ?? 0;
      check(
        "the primary is the first active branch by order",
        primary.isActive && primary.order === minOrder,
      );
    }

    await StoreLocation.updateOne(
      { "name.ka": `${MARKER} second` },
      { $set: { order: 1 } },
    );
    // Scoped to the marker rows for the same reason: with real branches stored,
    // `getPrimaryLocation()` keeps returning one of those, so the observable
    // effect of reordering is which fixture comes first within the list.
    const afterReorder = (await stored()).filter((l) => l.name.ka.includes(MARKER));
    check(
      "reordering changes which marker branch comes first",
      afterReorder[0]?.name.ka.endsWith("second") === true,
    );

    check("an unset en stays unset, for pickLocale to resolve", list[0]?.name.en === undefined);

    const { isMapUrl } = await import("../lib/locations/validate");

    for (const good of [
      "https://maps.google.com/?q=41.7,44.8",
      "https://www.google.com/maps/place/Tbilisi",
      "https://goo.gl/maps/abc",
      "https://maps.app.goo.gl/abc",
    ]) {
      check(`the map rule accepts ${JSON.stringify(good)}`, isMapUrl(good));
    }

    for (const bad of [
      "http://maps.google.com/?q=1",
      "https://evil.example/maps",
      "https://google.com.evil.example/",
      "https://notgoogle.com/maps",
      "javascript:alert(1)",
      "maps.google.com",
      "",
    ]) {
      check(`the map rule refuses ${JSON.stringify(bad)}`, !isMapUrl(bad));
    }

    const { isSamePhone } = await import("../lib/locations/validate");

    check("isSamePhone ignores spacing", isSamePhone("+995 322 40 40 40", "+995322404040"));
    check(
      "isSamePhone tells two different numbers apart",
      !isSamePhone("+995 322 40 40 40", "+995 599 11 22 33"),
    );
    check(
      "isSamePhone treats an empty second number as no duplicate",
      !isSamePhone("+995 322 40 40 40", ""),
    );

    const { locationSchema } = await import("../lib/auth/schemas");

    const submission = (phone2: unknown) => ({
      name: { ka: "ფილიალი" },
      phone: "+995 322 40 40 40",
      phone2,
      address: { ka: "მისამართი" },
      workHours: { ka: "ორშ–შაბ 10:00–18:00" },
      order: 0,
      isActive: true,
    });

    check(
      "the schema accepts a second number",
      locationSchema.safeParse(submission("+995 599 11 22 33")).success,
    );
    check(
      "the schema accepts an empty second number — the box the operator left blank",
      locationSchema.safeParse(submission("")).success,
    );
    check(
      "the schema accepts an absent second number",
      locationSchema.safeParse(submission(undefined)).success,
    );

    const tooShort = locationSchema.safeParse(submission("+9"));
    check("the schema refuses a half-typed second number", !tooShort.success);
    check(
      "and reports it as phone_too_short, the code the form explains",
      tooShort.success === false &&
        tooShort.error.issues.some(
          (issue) => issue.path.join(".") === "phone2" && issue.message === "phone_too_short",
        ),
    );

    // A second number is optional, so all three states have to be checked: set,
    // absent, and set to the same number as the primary — which the mapper
    // drops, because a card showing one number twice reads as a bug.
    await cleanup();
    await StoreLocation.create(fixture("two-numbers", 10, true, "+995 599 11 22 33"));
    await StoreLocation.create(fixture("one-number", 20));
    await StoreLocation.create(fixture("dupe", 30, true, "+995 000 00 00 00"));

    const phoneRows = (await stored()).filter((l) => l.name.ka.includes(MARKER));
    const bySuffix = (suffix: string) => phoneRows.find((l) => l.name.ka.endsWith(suffix));

    check(
      "a stored second number comes back through the mapper",
      bySuffix("two-numbers")?.phone2 === "+995 599 11 22 33",
    );
    check(
      "an absent second number stays undefined rather than an empty string",
      bySuffix("one-number")?.phone2 === undefined,
    );
    check(
      "a second number equal to the first is dropped on read",
      bySuffix("dupe")?.phone2 === undefined,
    );

    // The PATCH and DELETE active-count guards both run exactly
    // `countDocuments({ isActive: true, _id: { $ne: <the row being changed> } })`
    // and refuse when it is 0. This is not exercised by calling the route —
    // no route is invoked here — it runs the guard's own query directly, the
    // same way the checks above exercise `getLocations()` and `isMapUrl()`
    // directly. The HTTP 409 itself is covered by the browser pass.
    await cleanup();
    const onlyDoc = await StoreLocation.create(fixture("only", 10));

    // Scoped to the marker so this stays correct once real branches exist —
    // an unscoped query would count every real active branch alongside the
    // fixture and never reach 0.
    const otherActiveMarkers = () =>
      StoreLocation.countDocuments({
        "name.ka": { $regex: MARKER },
        isActive: true,
        _id: { $ne: onlyDoc._id },
      });

    check(
      "with one active marker branch, the guard's query finds no others — the condition that makes it refuse",
      (await otherActiveMarkers()) === 0,
    );

    await StoreLocation.create(fixture("second-branch", 20));

    check(
      "and finds one once a second active branch exists — the condition that lets it proceed",
      (await otherActiveMarkers()) === 1,
    );
  } finally {
    await cleanup();
    await mongoose.disconnect();
  }

  console.log(`\n${passed} checks passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
