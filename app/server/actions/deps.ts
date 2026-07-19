import type { GameData } from "game-data";
import type { SeededRandomSource } from "game-engine";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import type { SessionResolver } from "../auth/session";
import type { InvitationRateLimiter } from "../lifecycle/rate-limit";

/**
 * Dependency shape for the action pipeline (M7-T2).
 *
 * Mirrors `LifecycleDeps` (M6): the route injects the live database, reference
 * data and default session resolver; tests inject a PGlite handle, a seeded
 * resolver and deterministic clock / randomness / id allocation. The pipeline is
 * generic over the driver so it runs on Neon and PGlite alike (`database.md` §3).
 *
 * @see app/server/lifecycle/deps.ts
 * @see docs/04-development/milestones/m7-actions.md (M7-T2)
 */
export interface ActionDeps<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
> {
  /** The database handle to run the action transaction through. */
  readonly db: PgDatabase<TQuery, TSchema>;
  /** Reference data (units/terrain/properties/commanders/maps) for the engine. */
  readonly gameData: GameData;
  /** Session source; omitted in production so `requireUser` reads the request. */
  readonly resolveSession?: SessionResolver;
  /** Activation/turn clock (injected in tests); defaults to the wall clock. */
  readonly now?: () => Date;
  /**
   * Builds the deterministic `RandomSource` from a match's seed + sequence index;
   * defaults to the engine's `createRandomSource`. Injected so tests can assert
   * exact draws or substitute a fake.
   */
  readonly randomSourceFactory?: (
    seed: string,
    startIndex: number,
  ) => SeededRandomSource;
  /** Server id allocator for produced units; defaults to a random UUID. */
  readonly generateUnitId?: () => string;
  /** Action rate limiter (defaults to the process-wide limiter). */
  readonly rateLimiter?: InvitationRateLimiter;
  /**
   * Runs work that must not delay the response — notification scheduling, whose
   * own contract is `gameplay_authority: false`. Production passes Next's
   * `after`, which runs it once the response has been flushed; the default
   * awaits inline so tests (and any caller that forgets) keep the old ordering
   * and stay deterministic.
   */
  readonly deferAfterResponse?: (task: () => Promise<void>) => void;
}
