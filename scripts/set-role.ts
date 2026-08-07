/**
 * Grants or revokes the admin role for an existing account.
 *
 *   npm run set-role -- strongwash2026@gmail.com admin
 *   npm run set-role -- someone@example.com customer
 *
 * There is no self-registration path to admin on purpose: promotion happens here
 * or directly in Atlas, never through a web form, so a stolen admin session
 * cannot mint more admins.
 *
 * The account must already exist — sign up through the site first. This script
 * does not create accounts, because that would mean choosing a password for
 * someone else and mailing it around.
 */
import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";

import { User, USER_ROLES, type UserRole } from "../lib/models/user";

loadEnvConfig(process.cwd());

function usage(message: string): never {
  console.error(message);
  console.error("usage: npm run set-role -- <email> <" + USER_ROLES.join("|") + ">");
  process.exit(2);
}

async function main() {
  const [emailArg, roleArg] = process.argv.slice(2);
  if (!emailArg) usage("No email given.");
  if (!roleArg) usage("No role given.");
  if (!USER_ROLES.includes(roleArg as UserRole)) usage(`Unknown role "${roleArg}".`);

  const email = emailArg.trim().toLowerCase();
  const role = roleArg as UserRole;

  const uri = process.env.MONGODB_URI;
  if (!uri) usage("MONGODB_URI is not set. Fill in .env.local first.");
  if (/<db_username>|<db_password>|USER:PASSWORD/.test(uri)) {
    usage("MONGODB_URI still contains placeholder credentials.");
  }

  await mongoose.connect(uri);

  const user = await User.findOne({ email });
  if (!user) {
    console.error(`No account for ${email}. Sign up on the site first, then re-run this.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const previous = user.role ?? "customer";
  if (previous === role) {
    console.log(`${email} is already ${role}. Nothing to do.`);
    await mongoose.disconnect();
    return;
  }

  // Refuse to remove the last admin: nobody could reach the panel to undo it.
  if (previous === "admin" && role !== "admin") {
    const admins = await User.countDocuments({ role: "admin" });
    if (admins <= 1) {
      console.error(
        `${email} is the only admin. Promote someone else first, or you will lock yourself out.`,
      );
      await mongoose.disconnect();
      process.exit(1);
    }
  }

  user.role = role;
  await user.save();

  console.log(`${email}: ${previous} -> ${role}`);
  console.log(`admins now: ${await User.countDocuments({ role: "admin" })}`);

  // The session cookie carries the role it was issued with, so an already
  // signed-in user needs a fresh sign-in before the panel opens for them.
  console.log("Note: sign out and back in for the change to reach an active session.");

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
