import { NextResponse } from "next/server";

import { MissingDatabaseUriError } from "./db";

/**
 * One error shape for every route handler.
 *
 * A misconfigured or unreachable database is an operator problem, not a client
 * problem: it answers 503 so a caller can retry, and the reason is echoed only
 * for the configuration case, which contains no secrets. Anything else is
 * logged server-side and reported as an opaque 500 — leaking a Mongo error
 * string to a public endpoint tells an attacker about collections and hosts.
 */
export function apiError(error: unknown): NextResponse {
  if (error instanceof MissingDatabaseUriError) {
    return NextResponse.json(
      { error: "database_not_configured", message: error.message },
      { status: 503 },
    );
  }

  const name = error instanceof Error ? error.name : "";
  if (name === "MongooseServerSelectionError" || name === "MongoNetworkError") {
    return NextResponse.json({ error: "database_unavailable" }, { status: 503 });
  }

  console.error("[api]", error);
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}

/** Response for a well-formed request that named something nonexistent. */
export function notFoundJson(what: string): NextResponse {
  return NextResponse.json({ error: "not_found", resource: what }, { status: 404 });
}

/** Field-level validation failures, keyed by field so a form can render them. */
export function validationError(fields: Record<string, string>): NextResponse {
  return NextResponse.json({ error: "validation_failed", fields }, { status: 422 });
}
