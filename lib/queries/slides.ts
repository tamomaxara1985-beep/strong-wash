import { cache } from "react";

import { connectToDatabase } from "../db";
import { HeroSlide as HeroSlideModel } from "../models/hero-slide";
import type { HeroSlide } from "../types";
import { toHeroSlide } from "./map";

/**
 * The active banners, in display order.
 *
 * An empty result is a normal state, not a failure: the homepage renders its
 * original hero when there are no slides, which is what makes this feature
 * reversible without a deploy and what covers the window before the first banner
 * is uploaded.
 */
export const getHeroSlides = cache(async (): Promise<HeroSlide[]> => {
  await connectToDatabase();
  const docs = await HeroSlideModel.find({ isActive: true }).sort({ order: 1 }).lean();
  return docs.map(toHeroSlide);
});
