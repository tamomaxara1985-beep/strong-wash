import { cache } from "react";

import { connectToDatabase } from "../db";
import { DEFAULT_LOCATION } from "../locations/defaults";
import { StoreLocation as StoreLocationModel } from "../models/store-location";
import type { StoreLocation } from "../types";
import { toStoreLocation } from "./map";

/**
 * The active branches, in display order.
 *
 * Never empty and never throws: with nothing stored — or with the database
 * unreachable — it returns the single default branch. These are read in the root
 * layout, so they sit on the path of every page, and a site that renders without
 * a telephone number is worse than one showing the address it shipped with.
 */
export const getLocations = cache(async (): Promise<StoreLocation[]> => {
  try {
    await connectToDatabase();
    const docs = await StoreLocationModel.find({ isActive: true }).sort({ order: 1 }).lean();
    if (!docs.length) return [DEFAULT_LOCATION];
    return docs.map(toStoreLocation);
  } catch (error) {
    console.error("[locations] falling back to the default branch", error);
    return [DEFAULT_LOCATION];
  }
});

/**
 * The branch whose number the header, the mobile nav and every product page show.
 *
 * It is the first in sort order — deliberately not a stored `isPrimary` flag,
 * which can be set on two rows or on none, leaving something else to decide
 * anyway. Order already answers it and is reorderable.
 */
export const getPrimaryLocation = cache(async (): Promise<StoreLocation> => {
  const locations = await getLocations();
  return locations[0] ?? DEFAULT_LOCATION;
});
