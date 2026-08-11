import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, validationError } from "@/lib/api";
import { assertSameOrigin } from "@/lib/auth/guard";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import { contactMessageSchema, fieldErrors } from "@/lib/auth/schemas";
import { connectToDatabase } from "@/lib/db";
import { ContactMessage } from "@/lib/models/contact-message";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/types";

/**
 * Five an hour per IP, where the quote route allows twenty.
 *
 * Someone shortlisting three machines legitimately sends three quote requests;
 * nobody sends five unrelated enquiries in an hour. Both are per IP, and an
 * office behind NAT shares one — which is the reason neither number is 1.
 */
const MAX_PER_IP = 5;
const WINDOW_MS = 60 * 60 * 1000;

/** Text-only endpoint: the field caps total well under this, so anything larger is not a real message. */
const MAX_BODY_BYTES = 64 * 1024;

/**
 * A message from the contact page.
 *
 * Open to signed-out visitors, like the quote route: requiring an account before
 * someone can ask a question costs enquiries. Unlike the quote route it does not
 * read the session at all — a message is not part of an account's history, and
 * attaching a user would imply it is.
 */
export async function POST(request: NextRequest) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const limited = rateLimit(`contact:${clientIp(request)}`, MAX_PER_IP, WINDOW_MS);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
    );
  }

  // Rejected on the declared length before the body is read, so a deliberate
  // 500 MB post does not get buffered first.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  try {
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const parsed = contactMessageSchema.safeParse(payload);
    if (!parsed.success) return validationError(fieldErrors(parsed.error));

    // The honeypot: a field hidden from sight and from screen readers, which a
    // bot fills in and a person cannot. Read from the raw body because Zod
    // strips keys the schema does not declare, so it never reaches parsed.data.
    //
    // The answer is an ordinary 201 with a fabricated id. Telling a bot it was
    // detected only tells whoever wrote it what to change next.
    const honeypot = typeof payload.website === "string" ? payload.website.trim() : "";
    if (honeypot) {
      return NextResponse.json({ id: "accepted" }, { status: 201 });
    }

    const localeRaw = typeof payload.locale === "string" ? payload.locale : "";
    const locale: Locale = LOCALES.includes(localeRaw as Locale)
      ? (localeRaw as Locale)
      : DEFAULT_LOCALE;

    await connectToDatabase();

    const created = await ContactMessage.create({
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone || undefined,
      subject: parsed.data.subject,
      message: parsed.data.message,
      locale,
      status: "new",
    });

    return NextResponse.json({ id: String(created._id) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
