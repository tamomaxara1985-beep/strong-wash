import { Types } from "mongoose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, notFoundJson, validationError } from "@/lib/api";
import { assertSameOrigin, requireAdmin } from "@/lib/auth/guard";
import { fieldErrors, slideSchema } from "@/lib/auth/schemas";
import { connectToDatabase } from "@/lib/db";
import { HeroSlide } from "@/lib/models/hero-slide";
import { isCloudinaryImageUrl, isSiteRelativePath } from "@/lib/slides/validate";

/** Updates a banner. */
export async function PATCH(request: NextRequest, context: RouteContext<"/api/admin/slides/[id]">) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) return notFoundJson("slide");

    const parsed = slideSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(fieldErrors(parsed.error));

    if (!isCloudinaryImageUrl(parsed.data.image)) {
      return validationError({ image: "image_host" });
    }

    const href = parsed.data.href?.trim();
    if (href && !isSiteRelativePath(href)) {
      return validationError({ href: "href_not_relative" });
    }

    await connectToDatabase();
    const slide = await HeroSlide.findById(id);
    if (!slide) return notFoundJson("slide");

    slide.image = parsed.data.image;
    slide.alt = parsed.data.alt;
    slide.href = href || undefined;
    slide.width = parsed.data.width;
    slide.height = parsed.data.height;
    slide.order = parsed.data.order;
    slide.isActive = parsed.data.isActive;
    await slide.save();

    return NextResponse.json({ id: String(slide._id) });
  } catch (error) {
    return apiError(error);
  }
}

/**
 * Deletes a banner.
 *
 * Unguarded, unlike a brand or a category: nothing references a slide, so
 * removing one only removes it. The image itself stays in the media library.
 */
export async function DELETE(request: NextRequest, context: RouteContext<"/api/admin/slides/[id]">) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) return notFoundJson("slide");

    await connectToDatabase();
    const slide = await HeroSlide.findById(id).select("_id");
    if (!slide) return notFoundJson("slide");

    await slide.deleteOne();
    return NextResponse.json({ deleted: id });
  } catch (error) {
    return apiError(error);
  }
}
