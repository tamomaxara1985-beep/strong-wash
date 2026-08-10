import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, validationError } from "@/lib/api";
import { assertSameOrigin, requireAdmin } from "@/lib/auth/guard";
import { fieldErrors, slideSchema } from "@/lib/auth/schemas";
import { connectToDatabase } from "@/lib/db";
import { HeroSlide } from "@/lib/models/hero-slide";
import { isCloudinaryImageUrl, isSiteRelativePath } from "@/lib/slides/validate";

/** Creates a homepage banner. */
export async function POST(request: NextRequest) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
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

    const doc = new HeroSlide({
      image: parsed.data.image,
      alt: parsed.data.alt,
      href: href || undefined,
      width: parsed.data.width,
      height: parsed.data.height,
      order: parsed.data.order,
      isActive: parsed.data.isActive,
    });
    await doc.save();

    return NextResponse.json({ id: String(doc._id) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
