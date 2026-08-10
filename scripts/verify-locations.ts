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

function fixture(suffix: string, order: number, isActive = true) {
  return {
    name: { ka: `${MARKER} ${suffix}` },
    phone: "+995 000 00 00 00",
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

    const { getLocations, getPrimaryLocation } = await import("../lib/queries/locations");
    const { DEFAULT_LOCATION } = await import("../lib/locations/defaults");

    const empty = await getLocations();
    check("with nothing stored the list is the default branch", empty.length === 1);
    check("and it is DEFAULT_LOCATION", empty[0]?.id === DEFAULT_LOCATION.id);

    await StoreLocation.create(fixture("second", 20));
    await StoreLocation.create(fixture("first", 10));
    await StoreLocation.create(fixture("hidden", 5, false));

    const stored = (await import("../lib/queries/locations")).getLocations;
    const list = (await stored()).filter((l) => l.name.ka.includes(MARKER));

    check("stored branches replace the default", list.length === 2);
    check("they come back in order", list[0]?.name.ka.endsWith("first") === true);
    check("an inactive branch is absent", !list.some((l) => l.name.ka.endsWith("hidden")));

    const primary = await (await import("../lib/queries/locations")).getPrimaryLocation();
    check("the primary is the first by order", primary.name.ka.endsWith("first"));

    await StoreLocation.updateOne(
      { "name.ka": `${MARKER} second` },
      { $set: { order: 1 } },
    );
    const reordered = await (await import("../lib/queries/locations")).getPrimaryLocation();
    check("reordering changes which is primary", reordered.name.ka.endsWith("second"));

    check("an unset en stays unset, for pickLocale to resolve", list[0]?.name.en === undefined);
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
