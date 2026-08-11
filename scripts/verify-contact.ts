/**
 * DB-level and schema checks for contact messages.
 *
 * Run with `npm run verify:contact`. Every fixture carries the marker below in
 * `subject` and is removed in the `finally`, including when an assertion throws.
 * It writes to whatever MONGODB_URI points at, exactly like the seed script.
 */
import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";

import { ContactMessage } from "../lib/models/contact-message";

loadEnvConfig(process.cwd());

const MARKER = "zzz-verify-contact";
let passed = 0;

function check(label: string, condition: boolean) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  passed += 1;
  console.log(`  ok  ${label}`);
}

async function cleanup() {
  await ContactMessage.deleteMany({ subject: { $regex: MARKER } });
}

/** A complete, valid submission; each check overrides only what it is testing. */
function submission(overrides: Record<string, unknown> = {}) {
  return {
    name: "Nino Beridze",
    email: "nino@example.com",
    phone: "+995 599 11 22 33",
    subject: `${MARKER} question about a tunnel`,
    message: "Do you service the machine you install?",
    ...overrides,
  };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);

  try {
    await cleanup();

    const { contactMessageSchema, fieldErrors } = await import("../lib/auth/schemas");

    check("the schema accepts a complete message", contactMessageSchema.safeParse(submission()).success);
    check(
      "the schema accepts a message with no phone — the only optional field",
      contactMessageSchema.safeParse(submission({ phone: "" })).success,
    );

    const codeFor = (overrides: Record<string, unknown>, field: string) => {
      const result = contactMessageSchema.safeParse(submission(overrides));
      return result.success ? undefined : fieldErrors(result.error)[field];
    };

    check("a blank name is refused as required", codeFor({ name: "" }, "name") === "required");
    check("a blank subject is refused as required", codeFor({ subject: "" }, "subject") === "required");
    check("a blank message is refused as required", codeFor({ message: "" }, "message") === "required");
    check("a malformed email is refused", codeFor({ email: "not-an-email" }, "email") === "email");
    check(
      "a 5000-character message is refused as too long",
      codeFor({ message: "x".repeat(5000) }, "message") === "too_long",
    );

    // Stored messages start unread: the admin list's whole job is showing what
    // has not been dealt with yet.
    const created = await ContactMessage.create({ ...submission(), locale: "ka" });
    check("a stored message starts as new", created.status === "new");

    const { listAdminMessages, getAdminMessage } = await import("../lib/queries/admin");

    const rows = (await listAdminMessages()).filter((row) => row.subject.includes(MARKER));
    check("the stored message appears in the admin list", rows.length === 1);
    check("with its sender's details", rows[0]?.email === "nino@example.com");

    const one = await getAdminMessage(String(created._id));
    check("and can be read on its own", one?.message === submission().message);

    await ContactMessage.updateOne({ _id: created._id }, { $set: { status: "handled" } });
    const afterHandled = await getAdminMessage(String(created._id));
    check("marking it handled changes its status", afterHandled?.status === "handled");

    const { rateLimit } = await import("../lib/auth/rate-limit");
    const key = `contact:${MARKER}`;
    const verdicts = Array.from({ length: 6 }, () => rateLimit(key, 5, 60 * 60 * 1000).ok);
    check("five messages an hour are allowed", verdicts.slice(0, 5).every(Boolean));
    check("and the sixth is refused", verdicts[5] === false);
  } finally {
    await cleanup();
    await mongoose.disconnect();
  }

  console.log(`\n${passed} checks passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
