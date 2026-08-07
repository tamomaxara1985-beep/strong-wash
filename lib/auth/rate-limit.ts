/**
 * Fixed-window counters for the auth routes.
 *
 * Deliberately in-process: it needs no infrastructure and stops the obvious
 * scripted attack against a single instance. It is **not** sufficient in
 * production behind more than one instance or on serverless, where each process
 * keeps its own counters — that wants Redis or the platform's own limiter. Left
 * as the last line rather than the only one, and flagged here so it is a decision
 * rather than an oversight.
 */
type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

/** Bounds memory: a scripted attacker cycling keys must not grow the map forever. */
const MAX_KEYS = 10_000;

export type RateLimitResult = {
  ok: boolean;
  /** Seconds until the window resets, for `Retry-After`. */
  retryAfter: number;
};

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    if (windows.size >= MAX_KEYS) {
      for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
    }
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return { ok: false, retryAfter: Math.ceil((existing.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

/** Clears the counter for a key — called after a successful sign-in. */
export function resetRateLimit(key: string): void {
  windows.delete(key);
}

/**
 * Best-effort client address.
 *
 * `x-forwarded-for` is client-controlled unless a trusted proxy overwrites it,
 * so this is a throttling hint, never an identity. Vercel and most reverse
 * proxies do overwrite it; a bare `next start` behind nothing does not.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
