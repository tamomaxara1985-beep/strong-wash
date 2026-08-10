import { Types } from "mongoose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, notFoundJson, validationError } from "@/lib/api";
import { assertSameOrigin, requireAdmin } from "@/lib/auth/guard";
import { fieldErrors, locationSchema } from "@/lib/auth/schemas";
import { connectToDatabase } from "@/lib/db";
import { isMapUrl } from "@/lib/locations/validate";
import { StoreLocation } from "@/lib/models/store-location";

/** Updates a branch. */
export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/admin/locations/[id]">,
) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) return notFoundJson("location");

    const parsed = locationSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(fieldErrors(parsed.error));

    const mapUrl = parsed.data.mapUrl?.trim();
    if (mapUrl && !isMapUrl(mapUrl)) return validationError({ mapUrl: "map_host" });

    await connectToDatabase();
    const location = await StoreLocation.findById(id);
    if (!location) return notFoundJson("location");

    location.name = parsed.data.name;
    location.phone = parsed.data.phone;
    location.email = parsed.data.email || undefined;
    location.address = parsed.data.address;
    location.workHours = parsed.data.workHours;
    location.mapUrl = mapUrl || undefined;
    location.order = parsed.data.order;
    location.isActive = parsed.data.isActive;
    await location.save();

    return NextResponse.json({ id: String(location._id) });
  } catch (error) {
    return apiError(error);
  }
}

/**
 * Deletes a branch, unless it is the only one.
 *
 * With none stored every consumer falls back to the built-in default, so deleting
 * the last branch would silently restore the address the site shipped with — no
 * error, no empty state, just the wrong telephone number back on every page. The
 * refusal names the alternative.
 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext<"/api/admin/locations/[id]">,
) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) return notFoundJson("location");

    await connectToDatabase();
    const location = await StoreLocation.findById(id).select("_id");
    if (!location) return notFoundJson("location");

    // Counts every branch, active or not: an inactive one is still a row the
    // operator can re-activate, so it is not the "last" one in the sense that
    // matters here.
    const total = await StoreLocation.countDocuments({});
    if (total <= 1) {
      return NextResponse.json({ error: "last_location" }, { status: 409 });
    }

    await location.deleteOne();
    return NextResponse.json({ deleted: id });
  } catch (error) {
    return apiError(error);
  }
}
