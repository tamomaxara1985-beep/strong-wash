import { Types } from "mongoose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, notFoundJson, validationError } from "@/lib/api";
import { assertSameOrigin, requireAdmin } from "@/lib/auth/guard";
import { connectToDatabase } from "@/lib/db";
import { CONTACT_STATUSES, ContactMessage } from "@/lib/models/contact-message";

/** Marks a message handled, or puts it back in the unread pile. */
export async function PATCH(request: NextRequest, context: RouteContext<"/api/admin/messages/[id]">) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) return notFoundJson("message");

    const body = (await request.json().catch(() => ({}))) as { status?: unknown };
    const status = typeof body.status === "string" ? body.status : "";
    // Validated against the enum rather than trusted: this is the only field the
    // handler writes, so an unchecked value would be the whole attack surface.
    if (!CONTACT_STATUSES.includes(status as (typeof CONTACT_STATUSES)[number])) {
      return validationError({ status: "invalid" });
    }

    await connectToDatabase();
    const updated = await ContactMessage.findByIdAndUpdate(id, { $set: { status } }, { new: true })
      .select("_id status")
      .lean();
    if (!updated) return notFoundJson("message");

    return NextResponse.json({ id: String(updated._id), status: updated.status });
  } catch (error) {
    return apiError(error);
  }
}

/**
 * Deletes a message.
 *
 * No guard against deleting the last one, unlike locations: an empty inbox is a
 * perfectly good state, and spam is exactly what this button is for.
 */
export async function DELETE(request: NextRequest, context: RouteContext<"/api/admin/messages/[id]">) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) return notFoundJson("message");

    await connectToDatabase();
    const message = await ContactMessage.findById(id).select("_id");
    if (!message) return notFoundJson("message");

    await message.deleteOne();
    return NextResponse.json({ deleted: id });
  } catch (error) {
    return apiError(error);
  }
}
