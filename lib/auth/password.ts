import bcrypt from "bcryptjs";

/**
 * Cost 12 is the floor, not a tuning knob to lower. Each increment doubles the
 * work an offline cracker has to do per guess; 12 is roughly a quarter second on
 * current hardware, which is the point.
 */
const COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Burns roughly the same time as a real comparison.
 *
 * Sign-in must take the same time whether or not the email exists. Without this,
 * the fast path for an unknown address is a timing oracle for account
 * enumeration, which defeats the generic error message.
 */
export async function fakeVerify(): Promise<void> {
  await bcrypt.compare(
    "timing-equaliser",
    "$2b$12$C6UzMDM.H6dfI/f/IKcEe.hV7HdaIrxrIx6vFOFyOEsHZ3aq3iVYm",
  );
}
