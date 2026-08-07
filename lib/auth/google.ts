import { createHash, randomBytes } from "node:crypto";

import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Google OAuth 2.0, authorization-code flow with PKCE.
 *
 * Wired into the existing jose session rather than adopting Auth.js: the session
 * layer already works and is verifiable on the Edge, and swapping it out would
 * mean rewriting the password flow, the admin guard and the proxy gate to gain
 * one provider.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

/**
 * Google's public keys, fetched once and cached with rotation handled by jose.
 * Module scope on purpose: a new set per request would refetch the JWKS on every
 * sign-in and rate-limit us.
 */
const jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export class GoogleNotConfiguredError extends Error {
  constructor() {
    super(
      "Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET " +
        "in .env.local (see .env.example).",
    );
    this.name = "GoogleNotConfiguredError";
  }
}

export function googleConfig(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new GoogleNotConfiguredError();
  return { clientId, clientSecret };
}

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/**
 * The redirect URI must match a value registered in Google Cloud Console
 * *exactly*, including scheme and host. Derived from the request so localhost and
 * the deployed host both work without a second env var — but each still has to be
 * registered with Google.
 */
export function callbackUrl(origin: string): string {
  return new URL("/api/auth/google/callback", origin).toString();
}

export type PkcePair = { verifier: string; challenge: string };

/**
 * PKCE, even though this is a confidential client with a secret.
 *
 * The verifier binds the code to the browser that started the flow, so a code
 * intercepted from the redirect (browser history, a logging proxy, a malicious
 * extension) cannot be redeemed elsewhere. Cheap, and defends a case the client
 * secret does not.
 */
export function createPkce(): PkcePair {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function buildAuthUrl(options: {
  origin: string;
  state: string;
  nonce: string;
  challenge: string;
}): string {
  const { clientId } = googleConfig();
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callbackUrl(options.origin));
  url.searchParams.set("response_type", "code");
  // No broader scope than the identity we actually use.
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", options.state);
  url.searchParams.set("nonce", options.nonce);
  url.searchParams.set("code_challenge", options.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  // No refresh token is requested: we never call Google again on the user's
  // behalf, so storing one would be a liability with no purpose.
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export type GoogleProfile = {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
};

export class GoogleExchangeError extends Error {
  constructor(detail: string) {
    super(`Google rejected the authorization code: ${detail}`);
    this.name = "GoogleExchangeError";
  }
}

/**
 * Exchanges the code and validates the returned ID token.
 *
 * The ID token's signature, issuer, audience and nonce are all checked. Skipping
 * any of them would let a token minted for a different application be replayed
 * here — the audience check is what ties it to this client.
 */
export async function exchangeCode(options: {
  code: string;
  origin: string;
  verifier: string;
  nonce: string;
}): Promise<GoogleProfile> {
  const { clientId, clientSecret } = googleConfig();

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: options.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: callbackUrl(options.origin),
      grant_type: "authorization_code",
      code_verifier: options.verifier,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    id_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.id_token) {
    throw new GoogleExchangeError(
      payload.error_description ?? payload.error ?? `HTTP ${response.status}`,
    );
  }

  const { payload: claims } = await jwtVerify(payload.id_token, jwks, {
    issuer: ISSUERS,
    audience: clientId,
  });

  if (claims.nonce !== options.nonce) {
    throw new GoogleExchangeError("nonce mismatch");
  }

  const email = typeof claims.email === "string" ? claims.email.toLowerCase() : "";
  const googleId = typeof claims.sub === "string" ? claims.sub : "";
  if (!email || !googleId) throw new GoogleExchangeError("id token missing email or sub");

  return {
    googleId,
    email,
    // Google sends this as a boolean or the string "true" depending on the path.
    emailVerified: claims.email_verified === true || claims.email_verified === "true",
    name: typeof claims.name === "string" && claims.name.trim() ? claims.name.trim() : email,
    picture: typeof claims.picture === "string" ? claims.picture : undefined,
  };
}
