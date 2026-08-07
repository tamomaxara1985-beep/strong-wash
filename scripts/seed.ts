/**
 * Seeds Atlas from the typed fixtures in `lib/mock`.
 *
 * Idempotent: keyed on `slug` for brands and categories and on `sku` for
 * products, so re-running updates in place rather than duplicating. Safe to run
 * against a populated database.
 *
 *   npm run seed
 *
 * Ordering is forced by the references: brands and categories must exist before
 * products can point at them, and a category's parent must exist before the
 * pre-save hook can compute its `ancestors` and `path`.
 */
import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";

import { brands as brandFixtures } from "../lib/mock/brands";
import { categories as categoryFixtures } from "../lib/mock/categories";
import { products as productFixtures } from "../lib/mock/products";
import { Brand } from "../lib/models/brand";
import { Category } from "../lib/models/category";
import { Product } from "../lib/models/product";
import type { Locale, LocalizedString, Product as ProductType } from "../lib/types";

// Reuses Next's own loader, so the script reads the same .env.local the app does
// with no extra dependency.
loadEnvConfig(process.cwd());

function requireUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Fill in .env.local before seeding.");
  }
  if (/<db_username>|<db_password>|USER:PASSWORD/.test(uri)) {
    throw new Error(
      "MONGODB_URI still has placeholder credentials. Replace <db_username> and " +
        "<db_password> in .env.local with the Atlas database-user credentials.",
    );
  }
  return uri;
}

/** Denormalised lexical haystack. Phase 3 embeds the English variant. */
function buildSearchText(product: ProductType, brandName: string): LocalizedString {
  const parts = (locale: Locale) =>
    [
      product.name[locale] ?? product.name.ka,
      brandName,
      product.sku,
      product.shortDescription[locale] ?? product.shortDescription.ka,
      ...product.specs.map((spec) =>
        [spec.key, spec.valueString, spec.valueNumber, spec.valueBool].filter(Boolean).join(" "),
      ),
    ]
      .filter(Boolean)
      .join(" ");

  return { ka: parts("ka"), en: parts("en"), ru: parts("ru") };
}

async function seedBrands() {
  const idByFixtureId = new Map<string, mongoose.Types.ObjectId>();

  for (const fixture of brandFixtures) {
    const doc = await Brand.findOneAndUpdate(
      { slug: fixture.slug },
      {
        $set: {
          name: fixture.name,
          description: fixture.description,
          order: fixture.order,
          isActive: fixture.isActive,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    idByFixtureId.set(fixture.id, doc._id);
  }

  console.log(`brands:     ${idByFixtureId.size} upserted`);
  return idByFixtureId;
}

async function seedCategories() {
  const idByFixtureId = new Map<string, mongoose.Types.ObjectId>();

  // Parents first, so the pre-save hook can read the parent's `ancestors` and
  // `path`. Fixture depth is derived rather than assumed.
  const sorted = [...categoryFixtures].sort((a, b) => a.ancestors.length - b.ancestors.length);

  for (const fixture of sorted) {
    const parentId = fixture.parent ? idByFixtureId.get(fixture.parent) : null;
    if (fixture.parent && !parentId) {
      throw new Error(`Category "${fixture.slug}" names an unseeded parent "${fixture.parent}"`);
    }

    // `save()` rather than `findOneAndUpdate()`: the hook that maintains
    // `ancestors` and `path` is a document middleware and does not run on a
    // query update.
    // `path` is left unset: the pre-validate hook computes it from the parent.
    const doc =
      (await Category.findOne({ slug: fixture.slug })) ?? new Category({ slug: fixture.slug });

    doc.set({
      name: fixture.name,
      description: fixture.description,
      parent: parentId ?? null,
      icon: fixture.icon,
      order: fixture.order,
      isActive: fixture.isActive,
      specSchema: fixture.specSchema,
    });
    // The hook only recomputes when `parent` or `slug` changed; on a re-seed of
    // an unchanged tree neither has, so force it for correctness after any
    // fixture edit.
    doc.markModified("parent");
    await doc.save();

    idByFixtureId.set(fixture.id, doc._id);
  }

  console.log(`categories: ${idByFixtureId.size} upserted`);
  return idByFixtureId;
}

async function seedProducts(
  brandIds: Map<string, mongoose.Types.ObjectId>,
  categoryIds: Map<string, mongoose.Types.ObjectId>,
) {
  // The fixture builder already validated every spec key against the category's
  // effective schema, so an unknown key throws at import time rather than
  // silently vanishing from the facets.
  let count = 0;

  for (const fixture of productFixtures) {
    const brandId = brandIds.get(fixture.brand);
    const categoryId = categoryIds.get(fixture.category);
    if (!brandId) throw new Error(`Product ${fixture.sku} names unknown brand "${fixture.brand}"`);
    if (!categoryId) {
      throw new Error(`Product ${fixture.sku} names unknown category "${fixture.category}"`);
    }

    const ancestors = fixture.categoryAncestors.map((id) => {
      const mapped = categoryIds.get(id);
      if (!mapped) throw new Error(`Product ${fixture.sku} has unseeded ancestor "${id}"`);
      return mapped;
    });

    const doc = (await Product.findOne({ sku: fixture.sku })) ?? new Product({ sku: fixture.sku });

    doc.set({
      slug: fixture.slug,
      name: fixture.name,
      shortDescription: fixture.shortDescription,
      description: fixture.description,
      brand: brandId,
      category: categoryId,
      categoryAncestors: ancestors,
      price: fixture.price,
      salePrice: fixture.salePrice,
      stock: fixture.stock,
      stockStatus: fixture.stockStatus,
      images: fixture.images,
      specs: fixture.specs,
      searchText: buildSearchText(fixture, fixture.brandName),
      isActive: fixture.isActive,
      isFeatured: fixture.isFeatured,
    });
    await doc.save();

    // `timestamps: true` stamps `createdAt` itself and ignores an assigned
    // value, but the fixture date is what the "newest" sort is meant to order
    // by — so it is written back with timestamps suppressed.
    await Product.updateOne(
      { _id: doc._id },
      { $set: { createdAt: new Date(fixture.createdAt) } },
      { timestamps: false },
    );
    count += 1;
  }

  console.log(`products:   ${count} upserted`);
}

async function main() {
  const uri = requireUri();
  await mongoose.connect(uri);
  console.log(`connected to ${mongoose.connection.name}`);

  const brandIds = await seedBrands();
  const categoryIds = await seedCategories();
  await seedProducts(brandIds, categoryIds);

  // Declared indexes are only built when something asks for them; a fresh
  // database would otherwise serve the first traffic with collection scans.
  await Promise.all([Brand.syncIndexes(), Category.syncIndexes(), Product.syncIndexes()]);
  console.log("indexes:    synced");

  await mongoose.disconnect();
  console.log("done");
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
