import { Types } from "mongoose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, notFoundJson, validationError } from "@/lib/api";
import { assertSameOrigin, requireUser } from "@/lib/auth/guard";
import { fieldErrors, savedProductSchema } from "@/lib/auth/schemas";
import { connectToDatabase } from "@/lib/db";
import { Product } from "@/lib/models/product";
import { User } from "@/lib/models/user";

export async function POST(request: NextRequest) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  try {
    const result = await requireUser();
    if ("response" in result) return result.response;

    const parsed = savedProductSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(fieldErrors(parsed.error));
    const { productId, action } = parsed.data;

    if (!Types.ObjectId.isValid(productId)) return notFoundJson("product");

    await connectToDatabase();
    const exists = await Product.exists({ _id: productId, isActive: true });
    if (!exists) return notFoundJson("product");

    // `$addToSet`/`$pull` rather than read-modify-write: saving the same product
    // from two tabs would otherwise drop one of the writes.
    const update =
      action === "add"
        ? { $addToSet: { savedProducts: new Types.ObjectId(productId) } }
        : { $pull: { savedProducts: new Types.ObjectId(productId) } };

    const updated = await User.findByIdAndUpdate(result.userId, update, {
      returnDocument: "after",
      projection: { savedProducts: 1 },
    });

    return NextResponse.json({
      saved: action === "add",
      count: updated?.savedProducts?.length ?? 0,
    });
  } catch (error) {
    return apiError(error);
  }
}
