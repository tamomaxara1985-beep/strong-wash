import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { assertSameOrigin } from "@/lib/auth/guard";
import { clearSessionCookie } from "@/lib/auth/session";

/**
 * POST, not GET: a GET sign-out can be triggered by any `<img src>` on a page the
 * user visits, and browsers prefetch links.
 */
export async function POST(request: NextRequest) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
