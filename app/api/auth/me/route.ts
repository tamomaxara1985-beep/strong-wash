import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guard";

/** Current user, read from the database rather than the cookie's claims. */
export async function GET() {
  try {
    const result = await requireUser();
    if ("response" in result) return result.response;

    const { user } = result;
    return NextResponse.json({
      user: {
        id: String(user._id),
        email: user.email,
        name: user.name,
        phone: user.phone ?? null,
        company: user.company ?? null,
        role: user.role,
        savedProductCount: user.savedProducts?.length ?? 0,
        lastLoginAt: user.lastLoginAt,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
