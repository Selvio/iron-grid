import { and, eq, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { matches } from "../schema/matches";

/**
 * Data-version pinning primitive (M4-T7).
 *
 * `game_data_version` is written once at activation and never changed for an
 * active match; replay uses the pinned version (`database.md` §8,
 * `data_versioning`). The pin is conditional on the column still being null, so a
 * second attempt fails — enforcing immutability. Only the version string is
 * stored; the actual `GameData` is loaded from YAML by `game-data` (§11).
 *
 * @see docs/03-architecture/database.md §8, §11
 * @see docs/02-data/rules.yaml → data_versioning
 */
export async function pinGameDataVersion<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(
  db: PgDatabase<TQuery, TSchema>,
  matchId: string,
  version: string,
): Promise<void> {
  const [row] = await db
    .update(matches)
    .set({ gameDataVersion: version })
    .where(and(eq(matches.id, matchId), isNull(matches.gameDataVersion)))
    .returning({ gameDataVersion: matches.gameDataVersion });
  if (row === undefined) {
    throw new Error(
      `Cannot pin game_data_version for match ${matchId}: it is already pinned ` +
        `(immutable for an active match) or the match does not exist.`,
    );
  }
}

/** Returns the pinned `GameData` version for a match, or null if unpinned. */
export async function getPinnedGameDataVersion<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(db: PgDatabase<TQuery, TSchema>, matchId: string): Promise<string | null> {
  const [row] = await db
    .select({ gameDataVersion: matches.gameDataVersion })
    .from(matches)
    .where(eq(matches.id, matchId));
  return row?.gameDataVersion ?? null;
}
