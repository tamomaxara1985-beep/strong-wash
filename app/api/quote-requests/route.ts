import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, notFoundJson, validationError } from "@/lib/api";
import { assertSameOrigin } from "@/lib/auth/guard";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import { fieldErrors, quoteRequestSchema } from "@/lib/auth/schemas";
import { getSession } from "@/lib/auth/session";
import { connectToDatabase } from "@/lib/db";
import { Product } from "@/lib/models/product";
import { QuoteRequest } from "@/lib/models/quote-request";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/types";

const MAX_PER_IP = 10;
const WINDOW_MS = 60 * 60 * 1000;

/**
 * The v1 conversion event. Open to signed-out visitors — requiring an account
 * before a sales enquiry would cost leads — but the session is attached when
 * there is one, which is what gives an account its quote history.
 */
export async function POST(request: NextRequest) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const limited = rateLimit(`quote:${clientIp(request)}`, MAX_PER_IP, WINDOW_MS);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
    );
  }

  try {
    const body = await request.json();
    const parsed = quoteRequestSchema.safeParse(body);
    if (!parsed.success) return validationError(fieldErrors(parsed.error));

    const localeRaw = typeof body?.locale === "string" ? body.locale : "";
    const locale: Locale = LOCALES.includes(localeRaw as Locale)
      ? (localeRaw as Locale)
      : DEFAULT_LOCALE;

    await connectToDatabase();
    const product = await Product.findOne({ slug: parsed.data.productSlug, isActive: true })
      .select("_id")
      .lean();
    if (!product) return notFoundJson("product");

    const session = await getSession();

    const created = await QuoteRequest.create({
      user: session?.userId ?? null,
      product: product._id,
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone || undefined,
      company: parsed.data.company || undefined,
      message: parsed.data.message || undefined,
      locale,
      status: "new",
    });

    return NextResponse.json({ id: created._id.toString() }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
