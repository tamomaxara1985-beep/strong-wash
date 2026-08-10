import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, validationError } from "@/lib/api";
import { assertSameOrigin, requireAdmin } from "@/lib/auth/guard";
import { fieldErrors, locationSchema } from "@/lib/auth/schemas";
import { connectToDatabase } from "@/lib/db";
import { isMapUrl } from "@/lib/locations/validate";
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

    await connectToDatabase();

    const doc = new StoreLocation({
      name: parsed.data.name,
      phone: parsed.data.phone,
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
