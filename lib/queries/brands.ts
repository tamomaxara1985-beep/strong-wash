import { cache } from "react";

import { connectToDatabase } from "../db";
import { Brand as BrandModel } from "../models/brand";
import type { Brand } from "../types";
import { toBrand } from "./map";

export const getAllBrands = cache(async (): Promise<Brand[]> => {
  await connectToDatabase();
  const docs = await BrandModel.find({ isActive: true }).sort({ order: 1 }).lean();
  return docs.map(toBrand);
});

/**
 * Every brand, hidden ones included.
 *
 * Name resolution must not depend on `isActive`: a product whose brand is hidden
 * is still listed, and reading it from the active-only list would render a blank
 * manufacturer instead of an inactive one. Filters and facets keep using
 * `getAllBrands` — hiding a brand should remove it as a *choice*, not as a label.
 */
export const getAllBrandsIncludingInactive = cache(async (): Promise<Brand[]> => {
  await connectToDatabase();
  const docs = await BrandModel.find({}).sort({ order: 1 }).lean();
  return docs.map(toBrand);
});

export async function getBrandBySlug(slug: string): Promise<Brand | undefined> {
  return (await getAllBrands()).find((b) => b.slug === slug);
}

export async function getBrandById(id: string): Promise<Brand | undefined> {
  return (await getAllBrands()).find((b) => b.id === id);
}
