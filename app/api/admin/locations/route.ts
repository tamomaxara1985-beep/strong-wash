import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, validationError } from "@/lib/api";
import { assertSameOrigin, requireAdmin } from "@/lib/auth/guard";
import { fieldErrors, locationSchema } from "@/lib/auth/schemas";
import { connectToDatabase } from "@/lib/db";
import { isMapUrl, isSamePhone } from "@/lib/locations/validate";
import { StoreLocation } from "@/lib/models/store-location";

/** Creates a branch. */
export async function POST(request: NextRequest) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const parsed = locationSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(fieldErrors(parsed.error));

    const mapUrl = parsed.data.mapUrl?.trim();
    if (mapUrl && !isMapUrl(mapUrl)) return validationError({ mapUrl: "map_host" });

    // The same number on both lines renders twice on the branch card, which
    // reads as a bug. What the operator wants is an empty box.
    const phone2 = parsed.data.phone2?.trim();
    if (phone2 && isSamePhone(parsed.data.phone, phone2)) {
      return validationError({ phone2: "same_as_phone" });
    }

    await connectToDatabase();

    const doc = new StoreLocation({
      name: parsed.data.name,
      phone: parsed.data.phone,
      phone2: phone2 || undefined,
      email: parsed.data.email || undefined,
      address: parsed.data.address,
      workHours: parsed.data.workHours,
      mapUrl: mapUrl || undefined,
      order: parsed.data.order,
      isActive: parsed.data.isActive,
    });
    await doc.save();

    return NextResponse.json({ id: String(doc._id) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
