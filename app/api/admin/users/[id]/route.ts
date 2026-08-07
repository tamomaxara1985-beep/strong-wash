import { Types } from "mongoose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, notFoundJson, validationError } from "@/lib/api";
import { assertSameOrigin, requireAdmin } from "@/lib/auth/guard";
import { fieldErrors, profileSchema } from "@/lib/auth/schemas";
import { connectToDatabase } from "@/lib/db";
import { QuoteRequest } from "@/lib/models/quote-request";
import { User } from "@/lib/models/user";

/**
 * Edits a user's contact details.
 *
 * `role` is deliberately not editable here. It is set directly in Atlas, which
 * means a stolen admin session cannot mint more admins — the most valuable thing
 * an attacker could do with one. `email` is also fixed: it is the login identity
 * and the unique key, so changing it belongs behind a verification flow rather
 * than an admin text field.
 */
export async function PATCH(request: NextRequest, context: RouteContext<"/api/admin/users/[id]">) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) return notFoundJson("user");

    const parsed = profileSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(fieldErrors(parsed.error));

    await connectToDatabase();
    const user = await User.findById(id);
    if (!user) return notFoundJson("user");

    user.name = parsed.data.name;
    user.phone = parsed.data.phone || undefined;
    user.company = parsed.data.company || undefined;
    await user.save();

    return NextResponse.json({
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        phone: user.phone ?? null,
        company: user.company ?? null,
        role: user.role,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

/**
 * Deletes an account.
 *
 * Their quote requests are kept and de-linked rather than deleted: an enquiry is
 * a business record with its own copy of the contact details, and losing the
 * sales history because someone closed their account would be worse than keeping
 * an orphaned row. The account can no longer sign in, which is what deletion is
 * for.
 */
export async function DELETE(request: NextRequest, context: RouteContext<"/api/admin/users/[id]">) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) return notFoundJson("user");

    // Deleting the account you are signed in as would end the session mid-flow
    // and, if it is the only admin, lock everyone out of the panel permanently.
    if (id === auth.userId) {
      return NextResponse.json({ error: "cannot_delete_self" }, { status: 409 });
    }

    await connectToDatabase();
    const user = await User.findById(id);
    if (!user) return notFoundJson("user");

    if (user.role === "admin") {
      const admins = await User.countDocuments({ role: "admin" });
      if (admins <= 1) {
        return NextResponse.json({ error: "cannot_delete_last_admin" }, { status: 409 });
      }
    }

    const detached = await QuoteRequest.updateMany({ user: user._id }, { $set: { user: null } });
    await user.deleteOne();

    return NextResponse.json({ deleted: id, quotesDetached: detached.modifiedCount });
  } catch (error) {
    return apiError(error);
  }
}
