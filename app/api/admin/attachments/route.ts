import { Types } from "mongoose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, notFoundJson, validationError } from "@/lib/api";
import { assertSameOrigin, requireAdmin } from "@/lib/auth/guard";
import { deleteAttachments } from "@/lib/cloudinary";
import { connectToDatabase } from "@/lib/db";
import { QuoteRequest } from "@/lib/models/quote-request";

/**
 * Removes one file from one enquiry.
 *
 * Delete only — no replace. An attachment is what the customer actually sent, so
 * substituting a different file would rewrite the record of the enquiry. Deleting
 * is offered because a customer may ask for their photo to be removed.
 *
 * Identified by (quote, publicId) rather than an id of its own: attachments are
 * subdocuments with `_id: false`, and the public id is unique per stored file.
 */
export async function DELETE(request: NextRequest) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const body = (await request.json()) as { quoteId?: unknown; publicId?: unknown };
    const quoteId = typeof body.quoteId === "string" ? body.quoteId : "";
    const publicId = typeof body.publicId === "string" ? body.publicId : "";
    if (!quoteId || !publicId) {
      return validationError({
        ...(quoteId ? {} : { quoteId: "required" }),
        ...(publicId ? {} : { publicId: "required" }),
      });
    }
    if (!Types.ObjectId.isValid(quoteId)) return notFoundJson("quote_request");

    await connectToDatabase();
    const quote = await QuoteRequest.findById(quoteId);
    if (!quote) return notFoundJson("quote_request");

    const file = (quote.attachments ?? []).find((a) => a.publicId === publicId);
    if (!file) return notFoundJson("attachment");

    await deleteAttachments([{ publicId: file.publicId, resourceType: file.resourceType }]);
    await QuoteRequest.updateOne(
      { _id: quote._id },
      { $pull: { attachments: { publicId } } },
    );

    return NextResponse.json({ deleted: publicId });
  } catch (error) {
    return apiError(error);
  }
}
