import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import type { SessionResolver } from "../auth/session";

/**
 * Shared dependency shape for the lifecycle endpoint handlers (M6).
 *
 * The route files inject the live database and (in production) the default
 * session resolver; tests inject a PGlite handle and a seeded resolver. Handlers
 * are generic over the driver so the same code runs on Neon and PGlite, exactly
 * like the M4 db primitives (`database.md` §3).
 *
 * @see docs/04-development/milestones/m6-lifecycle.md (§3)
 */
export interface LifecycleDeps<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
> {
  /** The database handle to run the lifecycle transaction through. */
  readonly db: PgDatabase<TQuery, TSchema>;
  /** Session source; omitted in production so `requireUser` reads the request. */
  readonly resolveSession?: SessionResolver;
}
