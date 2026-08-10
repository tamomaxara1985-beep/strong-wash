/**
 * DB-level checks for the hero carousel.
 *
 * Run with `npm run verify:slides`. Every fixture it creates carries the marker
 * below in `alt.ka` and is removed in the `finally`, including when an assertion
 * throws, so a failed run leaves nothing behind. It writes to whatever
 * MONGODB_URI points at, exactly like the seed script.
 */
import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";

import { HeroSlide } from "../lib/models/hero-slide";

loadEnvConfig(process.cwd());

const MARKER = "zzz-verify-slide";
let passed = 0;

function check(label: string, condition: boolean) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  passed += 1;
  console.log(`  ok  ${label}`);
}

async function cleanup() {
  await HeroSlide.deleteMany({ "alt.ka": { $regex: MARKER } });
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);

  try {
    await cleanup();

    const base = "https://res.cloudinary.com/hva1f8dq/image/upload/v1/";
    await HeroSlide.create({
      image: `${base}b.jpg`,
      alt: { ka: `${MARKER} second` },
      order: 20,
      isActive: true,
    });
    await HeroSlide.create({
      image: `${base}a.jpg`,
      alt: { ka: `${MARKER} first`, en: "first EN" },
      order: 10,
      isActive: true,
    });
    await HeroSlide.create({
      image: `${base}c.jpg`,
      alt: { ka: `${MARKER} hidden` },
      order: 30,
      isActive: false,
    });

    const { getHeroSlides } = await import("../lib/queries/slides");
    const slides = (await getHeroSlides()).filter((s) => s.alt.ka.includes(MARKER));

    check("slides come back in order", slides[0]?.alt.ka.endsWith("first") === true);
    check("and the second is second", slides[1]?.alt.ka.endsWith("second") === true);
    check("an inactive slide is absent", slides.length === 2);
    // Not a ka-fallback here: `localized()` (shared with every other read type)
    // leaves `en` unset when the DB has none — pickLocale() applies the ka
    // fallback at render time, per the LocalizedString contract in lib/types.ts.
    check("an unset en stays unset, for pickLocale to resolve at render", slides[1]?.alt.en === undefined);
    check("a set en wins", slides[0]?.alt.en === "first EN");
    check("href is undefined when unset", slides[0]?.href === undefined);

    // Item 7: the fallback itself, not just the absence of a premature
    // ka-backfill in the mapper — pickLocale() is what's supposed to resolve
    // an unset en/ru to the Georgian text at render time.
    const { pickLocale } = await import("../lib/localized");
    check(
      "pickLocale falls back to Georgian when a locale is unset",
      pickLocale(slides[1]?.alt, "en") === slides[1]?.alt.ka,
    );

    await HeroSlide.updateMany({ "alt.ka": { $regex: MARKER } }, { $set: { isActive: false } });
    const none = (await import("../lib/queries/slides")).getHeroSlides;
    const empty = (await none()).filter((s) => s.alt.ka.includes(MARKER));
    check("with none active the query returns an empty list", empty.length === 0);

    const { isCloudinaryImageUrl, isSiteRelativePath } = await import("../lib/slides/validate");

    check(
      "a cloudinary delivery url is accepted",
      isCloudinaryImageUrl("https://res.cloudinary.com/hva1f8dq/image/upload/v1/a.jpg"),
    );
    for (const bad of [
      "https://evil.example/a.jpg",
      "http://res.cloudinary.com/hva1f8dq/a.jpg",
      "/local/a.jpg",
      "javascript:alert(1)",
      "",
    ]) {
      check(`the image rule refuses ${JSON.stringify(bad)}`, !isCloudinaryImageUrl(bad));
    }

    check("a relative path is accepted", isSiteRelativePath("/c/sand-washing"));
    check("a nested relative path is accepted", isSiteRelativePath("/c/automatic-systems/gantry"));
    for (const bad of [
      "https://evil.example",
      "//evil.example",
      "javascript:alert(1)",
      "c/x",
      "",
      "/\t/evil.example",
      "/\r/evil.example",
      "/\n/evil.example",
      "/\\evil.example",
    ]) {
      check(`the href rule refuses ${JSON.stringify(bad)}`, !isSiteRelativePath(bad));
    }

    // Item 6: the schema itself, not just the validate.ts helpers above —
    // slideSchema is what the write handlers actually run.
    const { slideSchema } = await import("../lib/auth/schemas");
    check(
      "slideSchema rejects an empty Georgian alt",
      !slideSchema.safeParse({
        image: `${base}a.jpg`,
        alt: { ka: "" },
        order: 0,
        isActive: true,
      }).success,
    );
    check(
      "slideSchema accepts a valid payload",
      slideSchema.safeParse({
        image: `${base}a.jpg`,
        alt: { ka: `${MARKER} schema-valid` },
        order: 0,
        isActive: true,
      }).success,
    );

    await cleanup();
    const afterCleanup = await (await import("../lib/queries/slides")).getHeroSlides();
    check(
      "an empty collection yields an array, not a throw",
      Array.isArray(afterCleanup),
    );
    // Array.isArray() alone is unconditionally true for a .map() result — it
    // only proves the query did not throw. This is the assertion that would
    // actually fail if cleanup left a fixture behind.
    check(
      "and it carries none of the fixture markers this run created",
      !afterCleanup.some((slide) => slide.alt.ka.includes(MARKER)),
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
