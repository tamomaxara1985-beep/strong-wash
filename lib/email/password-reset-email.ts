import type { Locale } from "../types";

/**
 * The reset email, in the locale the request came from.
 *
 * Written as plain data rather than JSX: this runs in a route handler, has to
 * produce a text alternative alongside the HTML, and email clients support so
 * little CSS that a template engine buys nothing here. Inline styles only —
 * Gmail strips `<style>` blocks.
 */

type Copy = {
  subject: string;
  heading: string;
  intro: string;
  button: string;
  fallback: string;
  expiry: string;
  ignore: string;
  signature: string;
};

const COPY: Record<Locale, Copy> = {
  ka: {
    subject: "პაროლის აღდგენა — Strong Wash",
    heading: "პაროლის აღდგენა",
    intro:
      "მივიღეთ მოთხოვნა თქვენი Strong Wash-ის ანგარიშის პაროლის შესაცვლელად. ახალი პაროლის დასაყენებლად დააჭირეთ ღილაკს:",
    button: "ახალი პაროლის დაყენება",
    fallback: "თუ ღილაკი არ მუშაობს, დააკოპირეთ ეს ბმული ბრაუზერში:",
    expiry: "ბმული აქტიურია 60 წუთი და მუშაობს ერთხელ.",
    ignore:
      "თუ პაროლის შეცვლა არ მოგითხოვიათ, უბრალოდ დააიგნორეთ ეს წერილი — თქვენი პაროლი უცვლელი დარჩება.",
    signature: "Strong Wash — პროფესიონალური სამრეცხაო აღჭურვილობა",
  },
  en: {
    subject: "Reset your password — Strong Wash",
    heading: "Reset your password",
    intro:
      "We received a request to change the password on your Strong Wash account. Use the button below to set a new one:",
    button: "Set a new password",
    fallback: "If the button does not work, copy this link into your browser:",
    expiry: "The link is valid for 60 minutes and works once.",
    ignore:
      "If you did not ask to change your password, ignore this email — your password stays as it is.",
    signature: "Strong Wash — professional car wash equipment",
  },
  ru: {
    subject: "Сброс пароля — Strong Wash",
    heading: "Сброс пароля",
    intro:
      "Мы получили запрос на смену пароля для вашего аккаунта Strong Wash. Нажмите кнопку, чтобы задать новый:",
    button: "Задать новый пароль",
    fallback: "Если кнопка не работает, скопируйте эту ссылку в браузер:",
    expiry: "Ссылка действует 60 минут и срабатывает один раз.",
    ignore:
      "Если вы не запрашивали смену пароля, просто проигнорируйте это письмо — пароль останется прежним.",
    signature: "Strong Wash — профессиональное оборудование для автомоек",
  },
};

/** Escapes interpolated values so a display name cannot inject markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function passwordResetEmail(options: { locale: Locale; name: string; url: string }): {
  subject: string;
  text: string;
  html: string;
} {
  const copy = COPY[options.locale] ?? COPY.ka;
  const greeting = options.name ? `${options.name},` : "";

  const text = [
    greeting,
    "",
    copy.intro,
    "",
    options.url,
    "",
    copy.expiry,
    copy.ignore,
    "",
    copy.signature,
  ]
    .filter((line, index, all) => !(line === "" && all[index - 1] === ""))
    .join("\n");

  const html = `<!doctype html>
<html lang="${options.locale}">
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="background:#010101;padding:16px 24px;">
          <span style="display:inline-block;background:#fec303;color:#010101;font-weight:700;font-size:12px;padding:4px 8px;border-radius:3px;">STRONG WASH</span>
        </td>
      </tr>
      <tr>
        <td style="padding:24px;">
          <h1 style="margin:0 0 12px;font-size:20px;">${escapeHtml(copy.heading)}</h1>
          ${greeting ? `<p style="margin:0 0 12px;font-size:15px;">${escapeHtml(greeting)}</p>` : ""}
          <p style="margin:0 0 20px;font-size:15px;line-height:1.55;">${escapeHtml(copy.intro)}</p>
          <p style="margin:0 0 20px;">
            <a href="${escapeHtml(options.url)}" style="display:inline-block;background:#fec303;color:#010101;font-weight:700;font-size:15px;text-decoration:none;padding:12px 20px;border-radius:8px;">${escapeHtml(copy.button)}</a>
          </p>
          <p style="margin:0 0 6px;font-size:13px;color:#6b7280;">${escapeHtml(copy.fallback)}</p>
          <p style="margin:0 0 20px;font-size:12px;word-break:break-all;"><a href="${escapeHtml(options.url)}" style="color:#2563eb;">${escapeHtml(options.url)}</a></p>
          <p style="margin:0 0 6px;font-size:13px;color:#6b7280;">${escapeHtml(copy.expiry)}</p>
          <p style="margin:0;font-size:13px;color:#6b7280;">${escapeHtml(copy.ignore)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 24px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
          ${escapeHtml(copy.signature)}
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject: copy.subject, text, html };
}

/**
 * Sent instead when the address has no password — a Google-only account.
 *
 * The requester is told nothing either way, but the mailbox owner deserves an
 * explanation rather than silence, and this is the only channel where saying
 * "you sign in with Google" leaks nothing: it reaches the account's own inbox.
 */
export function googleOnlyEmail(options: { locale: Locale; signInUrl: string }): {
  subject: string;
  text: string;
  html: string;
} {
  const body: Record<Locale, { subject: string; message: string }> = {
    ka: {
      subject: "შესვლა Google-ით — Strong Wash",
      message:
        "თქვენი Strong Wash-ის ანგარიში Google-ით შედის, ამიტომ პაროლი არ არსებობს. შესვლისას აირჩიეთ „Google-ით გაგრძელება“.",
    },
    en: {
      subject: "You sign in with Google — Strong Wash",
      message:
        "Your Strong Wash account signs in with Google, so there is no password to reset. Choose “Continue with Google” on the sign-in page.",
    },
    ru: {
      subject: "Вход через Google — Strong Wash",
      message:
        "Ваш аккаунт Strong Wash входит через Google, поэтому пароля нет. На странице входа выберите «Продолжить с Google».",
    },
  };

  const copy = body[options.locale] ?? body.ka;
  const text = `${copy.message}\n\n${options.signInUrl}\n`;
  const html = `<!doctype html>
<html lang="${options.locale}">
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;">
      <tr><td style="font-size:15px;line-height:1.55;">
        <p style="margin:0 0 16px;">${escapeHtml(copy.message)}</p>
        <p style="margin:0;"><a href="${escapeHtml(options.signInUrl)}" style="color:#2563eb;">${escapeHtml(options.signInUrl)}</a></p>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject: copy.subject, text, html };
}
