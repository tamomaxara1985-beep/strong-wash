import nodemailer, { type Transporter } from "nodemailer";

/**
 * Outbound email over Gmail SMTP.
 *
 * Gmail is fine for a low volume of transactional mail and needs no DNS work,
 * which is why it is here. Its limits are real though: roughly 500 recipients a
 * day, and mail from a gmail.com address to unrelated domains is more likely to
 * be filtered than mail from a domain you control with SPF and DKIM. When
 * password-reset mail starts landing in spam, that is the reason, and the fix is
 * a transactional provider on the shop's own domain rather than a bigger app
 * password.
 */

export class EmailNotConfiguredError extends Error {
  constructor() {
    super(
      "Email is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env.local " +
        "(see .env.example).",
    );
    this.name = "EmailNotConfiguredError";
  }
}

/**
 * One transporter per process, cached on `globalThis`.
 *
 * Creating one per send would open a fresh TLS connection and re-authenticate
 * every time; the pool keeps a connection warm and survives hot reload the same
 * way the Mongoose connection does.
 */
const globalForMail = globalThis as typeof globalThis & {
  _mailTransporter?: Transporter;
};

export function isEmailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function transporter(): Transporter {
  if (globalForMail._mailTransporter) return globalForMail._mailTransporter;

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new EmailNotConfiguredError();

  globalForMail._mailTransporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    // Implicit TLS on 465 rather than STARTTLS on 587: nothing is sent in the
    // clear, not even the initial handshake.
    port: 465,
    secure: true,
    // Gmail app passwords are shown in groups of four; spaces are not part of
    // the secret and SMTP auth rejects them.
    auth: { user, pass: pass.replace(/\s+/g, "") },
    pool: true,
    maxConnections: 2,
  });

  return globalForMail._mailTransporter;
}

export type SentMail = { messageId: string; accepted: string[]; rejected: string[] };

export async function sendMail(options: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<SentMail> {
  const from = process.env.EMAIL_FROM ?? process.env.GMAIL_USER ?? "";
  const info = await transporter().sendMail({ from, ...options });

  return {
    messageId: String(info.messageId ?? ""),
    accepted: (info.accepted ?? []).map(String),
    rejected: (info.rejected ?? []).map(String),
  };
}
