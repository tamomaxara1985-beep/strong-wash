/**
 * DB-level checks for the brand admin feature.
 *
 * Run with `npm run verify:brands`. Every fixture it creates is prefixed
 * `zzz-verify-` and removed in the `finally` block, including when an assertion
 * throws — so a failed run does not leave rows behind. It writes to whatever
 * MONGODB_URI points at, exactly like the seed script.
 */
import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";

import { Brand } from "../lib/models/brand";
import { Product } from "../lib/models/product";

// Reuses Next's own loader, so the script reads the same .env.local the app does —
// same pattern as scripts/seed.ts. Safe below the imports: nothing read at import
// time touches the environment; `connectToDatabase` reads it when called.
loadEnvConfig(process.cwd());

const PREFIX = "zzz-verify-";
let passed = 0;

function check(label: string, condition: boolean) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  passed += 1;
  console.log(`  ok  ${label}`);
}

async function cleanup() {
  await Product.deleteMany({ sku: { $regex: `^${PREFIX}` } });
  await Brand.deleteMany({ slug: { $regex: `^${PREFIX}` } });
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);

  try {
    await cleanup();

    const brand = await Brand.create({
      slug: `${PREFIX}alpha`,
      name: "Verify Alpha",
      order: 900,
      isActive: true,
    });
    check("a brand can be created", Boolean(brand._id));

    const { listAdminBrands, getAdminBrand } = await import("../lib/queries/admin");
    const rows = await listAdminBrands();
    const row = rows.find((r) => r.slug === `${PREFIX}alpha`);
    check("listAdminBrands returns the new brand", Boolean(row));
    check("its product count starts at 0", row?.productCount === 0);
    check("getAdminBrand finds it by id", (await getAdminBrand(String(brand._id)))?.slug === `${PREFIX}alpha`);

    await Brand.updateOne({ _id: brand._id }, { $set: { isActive: false } });
    const hidden = (await listAdminBrands()).find((r) => r.slug === `${PREFIX}alpha`);
    check("listAdminBrands still lists it once hidden", Boolean(hidden));
    check("and reports it as inactive", hidden?.isActive === false);

    await Brand.updateOne({ _id: brand._id }, { $set: { isActive: true } });

    const { canDelete, repairBrandSearchText } = await import("../lib/brands/write");
    check("an unused brand can be deleted", (await canDelete(brand._id)).ok === true);

    // A product needs a category ref; any existing one will do, since nothing here
    // reads it back.
    const { Category } = await import("../lib/models/category");
    const category = await Category.findOne({}).select("_id").lean();
    if (!category) throw new Error("no categories in the database — run `npm run seed` first");

    await Product.create({
      sku: `${PREFIX}sku-1`,
      slug: `${PREFIX}product-1`,
      name: { ka: "სატესტო", en: "Verify Machine", ru: "Тест" },
      shortDescription: { ka: "ა", en: "b", ru: "в" },
      description: { ka: "ა", en: "b", ru: "в" },
      brand: brand._id,
      category: category._id,
      categoryAncestors: [category._id],
      price: 100,
      effectivePrice: 100,
      searchText: { ka: "Verify Alpha", en: "Verify Alpha", ru: "Verify Alpha" },
      specs: [],
    });

    const blocked = await canDelete(brand._id);
    check("a brand with products cannot be deleted", blocked.ok === false);
    check("and the refusal names the count", blocked.ok === false && blocked.products === 1);

    const repaired = await repairBrandSearchText(brand._id, "Verify Beta");
    check("renaming repairs its products", repaired === 1);

    const after = await Product.findOne({ sku: `${PREFIX}sku-1` }).select("searchText").lean();
    check("the new name is in searchText", after?.searchText?.en?.includes("Verify Beta") === true);
    check("the old name is gone", after?.searchText?.en?.includes("Verify Alpha") === false);
    check("the product's own name survived", after?.searchText?.en?.includes("Verify Machine") === true);
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
