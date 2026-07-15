import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { matches } from "../schema/matches";

/**
 * Optimistic-concurrency primitives (M4-T7).
 *
 * The reusable building blocks M7's action pipeline composes into
 * `action_processing.ordered_steps` (`database.md` §6, §10). They are not wired
 * into any endpoint here. The canonical rule is `rules.yaml` →
 * `concurrency_rules` / `game-specification.md` §25: lock the match row, compare
 * the expected version, and on success increment it by exactly one.
 *
 * @see docs/03-architecture/database.md §6, §10
 * @see docs/02-data/rules.yaml → concurrency_rules
 */

/**
 * A stale-version conflict carrying only the current safe `state_version` and
 * **no hidden state** (`concurrency_rules.conflict_response`). The `code`
 * matches `enums.validation_error_codes.stale_state_version`.
 */
export class StateVersionConflictError extends Error {
  readonly code = "stale_state_version";
  readonly currentStateVersion: number;

  constructor(currentStateVersion: number) {
    super(`Stale state version; current is ${currentStateVersion}.`);
    this.name = "StateVersionConflictError";
    this.currentStateVersion = currentStateVersion;
  }
}

/** The lockable identity of a match: its id and current version. */
export interface LockedMatch {
  readonly id: string;
  readonly stateVersion: number;
}

/**
 * Takes a row lock on the match (`SELECT … FOR UPDATE`) and returns its id and
 * current `state_version`, or null if it does not exist. Must run inside a
 * transaction; the lock is held until commit, serializing concurrent actions.
 */
export async function lockMatchForUpdate<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(
  db: PgDatabase<TQuery, TSchema>,
  matchId: string,
): Promise<LockedMatch | null> {
  const [row] = await db
    .select({ id: matches.id, stateVersion: matches.stateVersion })
    .from(matches)
    .where(eq(matches.id, matchId))
    .for("update");
  return row ?? null;
}

/**
 * Rejects a stale action: throws {@link StateVersionConflictError} when the
 * locked `current` version differs from the client's `expected` version.
 */
export function assertStateVersion(current: number, expected: number): void {
  if (current !== expected) throw new StateVersionConflictError(current);
}

/**
 * Increments `state_version` by exactly one and returns the new value. Called on
 * the commit path after {@link assertStateVersion} has passed under the lock.
 *
 * This bumps the **column only**. When the commit also rewrites the snapshot, let
 * `persistMatchSnapshot` mirror the already-bumped `meta.stateVersion` instead
 * (`database.md` §10) — do not use both on one commit, or the column and snapshot
 * versions will drift.
 */
export async function incrementStateVersion<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(db: PgDatabase<TQuery, TSchema>, matchId: string): Promise<number> {
  const [row] = await db
    .update(matches)
    .set({ stateVersion: sql`${matches.stateVersion} + 1` })
    .where(eq(matches.id, matchId))
    .returning({ stateVersion: matches.stateVersion });
  if (row === undefined) {
    throw new Error(
      `Cannot increment state version: match ${matchId} not found.`,
    );
  }
  return row.stateVersion;
}
