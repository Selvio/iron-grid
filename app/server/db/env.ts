/**
 * Server-only access to the database connection string (M4-T1).
 *
 * The value is read from the environment at call time — never at module load —
 * so importing the db layer performs no I/O and no test needs a live database.
 * Only the backend reads this; `game-engine` and `game-data` never do
 * (`architecture.md` §4).
 *
 * @see docs/03-architecture/database.md §2
 */

/**
 * Returns the PostgreSQL (Neon) connection string, throwing if it is absent.
 *
 * @throws if `DATABASE_URL` is unset or empty.
 */
export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error(
      "DATABASE_URL is not set. The backend needs a PostgreSQL (Neon) " +
        "connection string — see docs/03-architecture/database.md §2.",
    );
  }
  return url;
}
