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

    // Untying "Active" is another sanctioned way to reach zero active branches:
    // with none left, every consumer falls back to DEFAULT_LOCATION, silently
    // restoring the built-in contact details to every page. Refuse it the same
    // way DELETE refuses removing the last active branch.
    //
    // Gated on the TRANSITION (`location.isActive` was true), not the
    // submitted value alone: a branch that is already inactive changes
    // nothing about the active count when saved with isActive still false, and
    // refusing that save would lock the operator out of editing an already-
    // hidden branch's address, phone or hours unless they also ticked Active.
    if (parsed.data.isActive === false && location.isActive) {
      const otherActive = await StoreLocation.countDocuments({
        isActive: true,
        _id: { $ne: location._id },
      });
      if (otherActive === 0) {
        return NextResponse.json({ error: "last_active_location" }, { status: 409 });
      }
    }

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
 * Deletes a branch, unless doing so would leave zero rows or zero active rows.
 *
 * With none stored — or none active — every consumer falls back to the built-in
 * default, so deleting the last branch, or the last *active* one while an
 * inactive row survives, would silently restore the address the site shipped
 * with — no error, no empty state, just the wrong telephone number back on every
 * page. Each refusal names the alternative.
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
    const location = await StoreLocation.findById(id).select("_id isActive");
    if (!location) return notFoundJson("location");

    // Counts every branch, active or not: an inactive one is still a row the
    // operator can re-activate, so it is not the "last" one in the sense that
    // matters here.
    const total = await StoreLocation.countDocuments({});
    if (total <= 1) {
      return NextResponse.json({ error: "last_location" }, { status: 409 });
    }

    // The row count guard above is not enough: the site depends on the ACTIVE
    // count, and deleting the only active branch succeeds under that guard
    // whenever an inactive row also exists. Refuse that too, with a distinct
    // code so the two refusals read differently.
    if (location.isActive) {
      const otherActive = await StoreLocation.countDocuments({
        isActive: true,
        _id: { $ne: location._id },
      });
      if (otherActive === 0) {
        return NextResponse.json({ error: "last_active_location" }, { status: 409 });
      }
    }

    await location.deleteOne();
    return NextResponse.json({ deleted: id });
  } catch (error) {
    return apiError(error);
  }
}
