import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError, validationError } from "@/lib/api";
import { assertSameOrigin, requireAdmin } from "@/lib/auth/guard";
import { fieldErrors, settingsSchema } from "@/lib/auth/schemas";
import { connectToDatabase } from "@/lib/db";
import { SETTINGS_ID, SiteSettings } from "@/lib/models/site-settings";
import { contrastRatio } from "@/lib/settings/colors";
import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";
import { FONT_KEYS } from "@/lib/settings/fonts";

/** Text painted on each brand colour, so the guard measures the real pairing. */
const ON_YELLOW = "#101010";
const ON_BLACK = "#ffffff";
const MIN_RATIO = 4.5;

/**
 * Updates the singleton.
 *
 * There is no POST and no DELETE: the document is created by its first save, and
 * clearing a field back to empty restores its default, which is what an operator
 * means by removing a value.
 */
export async function PATCH(request: NextRequest) {
  const rejected = assertSameOrigin(request);
  if (rejected) return rejected;

  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const parsed = settingsSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(fieldErrors(parsed.error));

    const { brandYellow, brandBlack, fontKey } = parsed.data;

    if (fontKey && !FONT_KEYS.includes(fontKey)) {
      return validationError({ fontKey: "invalid" });
    }

    /**
     * Brand yellow carries black text everywhere it appears. A dark choice would
     * render black-on-dark with nothing failing loudly, so it is measured rather
     * than trusted.
     */
    if (brandYellow) {
      const ratio = contrastRatio(brandYellow, ON_YELLOW);
      if (ratio < MIN_RATIO) {
        return NextResponse.json(
          { error: "validation_failed", fields: { brandYellow: "low_contrast" }, ratio: Number(ratio.toFixed(2)) },
          { status: 422 },
        );
      }
    }

    if (brandBlack) {
      const ratio = contrastRatio(brandBlack, ON_BLACK);
      if (ratio < MIN_RATIO) {
        return NextResponse.json(
          { error: "validation_failed", fields: { brandBlack: "low_contrast" }, ratio: Number(ratio.toFixed(2)) },
          { status: 422 },
        );
      }
    }

    /**
     * `catalog-menu.tsx` and `quote-request-dialog.tsx` paint the two brand
     * colours directly on each other — brand black text on the brand yellow
     * button. Each colour can pass its own guard above and still land at a
     * failing ratio once paired, so the pairing itself is measured too. An
     * empty field means "use the default", which is what actually renders, so
     * the fallback is what gets checked here.
     */
    const pairYellow = brandYellow || DEFAULT_SETTINGS.brandYellow;
    const pairBlack = brandBlack || DEFAULT_SETTINGS.brandBlack;
    const pairRatio = contrastRatio(pairYellow, pairBlack);
    if (pairRatio < MIN_RATIO) {
      return NextResponse.json(
        {
          error: "validation_failed",
          fields: { brandYellow: "pair_contrast" },
          ratio: Number(pairRatio.toFixed(2)),
        },
        { status: 422 },
      );
    }

    await connectToDatabase();
    await SiteSettings.updateOne(
      { _id: SETTINGS_ID },
      {
        $set: {
          phone: parsed.data.phone ?? "",
          email: parsed.data.email ?? "",
          address: parsed.data.address ?? {},
          workHours: parsed.data.workHours ?? {},
          brandYellow: brandYellow ?? "",
          brandBlack: brandBlack ?? "",
          fontKey: fontKey ?? "",
        },
      },
      { upsert: true },
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
