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

export async function getBrandBySlug(slug: string): Promise<Brand | undefined> {
  return (await getAllBrands()).find((b) => b.slug === slug);
}

export async function getBrandById(id: string): Promise<Brand | undefined> {
  return (await getAllBrands()).find((b) => b.id === id);
}
