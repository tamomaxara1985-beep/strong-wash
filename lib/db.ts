import mongoose, { type Mongoose } from "mongoose";

/**
 * One connection per process, cached on `globalThis`.
 *
 * Two things force the cache. In dev, hot reload re-evaluates this module on
 * every edit, and a fresh `connect()` each time exhausts Atlas's connection
 * limit within a few saves. In serverless, a warm invocation reuses the same
 * process, so the pool should outlive a single request. The in-flight promise is
 * cached too, not just the resolved connection: several server components render
 * concurrently on a cold request and would otherwise each open a pool.
 */
type ConnectionCache = {
  conn: Mongoose | null;
  promise: Promise<Mongoose> | null;
};

const globalForMongoose = globalThis as typeof globalThis & {
  _mongooseCache?: ConnectionCache;
};

const cache: ConnectionCache = (globalForMongoose._mongooseCache ??= {
  conn: null,
  promise: null,
});

const PLACEHOLDER = /<db_username>|<db_password>|USER:PASSWORD/;

export class MissingDatabaseUriError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingDatabaseUriError";
  }
}

function readUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new MissingDatabaseUriError(
      "MONGODB_URI is not set. Copy .env.example to .env.local and fill it in.",
    );
  }
  if (PLACEHOLDER.test(uri)) {
    throw new MissingDatabaseUriError(
      "MONGODB_URI still contains the placeholder credentials. Replace " +
        "<db_username> and <db_password> in .env.local with the Atlas " +
        "database-user credentials.",
    );
  }
  return uri;
}

export async function connectToDatabase(): Promise<Mongoose> {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    const uri = readUri();
    cache.promise = mongoose
      .connect(uri, {
        // Fail fast instead of hanging a request for 30s when Atlas is
        // unreachable or the IP is not allow-listed.
        serverSelectionTimeoutMS: 8000,
        maxPoolSize: 10,
      })
      .catch((error: unknown) => {
        // A rejected promise left in the cache would be replayed to every later
        // caller, so the next request must be free to retry.
        cache.promise = null;
        throw error;
      });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}
