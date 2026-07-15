import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { idempotencyKeys } from "../schema/idempotency-keys";

/**
 * Exactly-once mutation recorder (M4-T6).
 *
 * Records the committed result under `(match_id, key)`, or — on a duplicate key —
 * returns the originally stored result rather than re-applying
 * (`action_processing.idempotency`). The insert-then-conflict pattern is atomic,
 * so it is correct even before the match row lock (M4-T7) serializes callers.
 *
 * @see docs/03-architecture/database.md §5.6
 */
export interface IdempotentOutcome {
  /** True when the key already existed and `result` is the stored original. */
  readonly replayed: boolean;
  /** The committed result — freshly recorded, or replayed from storage. */
  readonly result: unknown;
}

export async function recordIdempotentResult<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(
  db: PgDatabase<TQuery, TSchema>,
  matchId: string,
  key: string,
  result: unknown,
): Promise<IdempotentOutcome> {
  const inserted = await db
    .insert(idempotencyKeys)
    .values({ matchId, key, committedResult: result })
    .onConflictDoNothing()
    .returning({ committedResult: idempotencyKeys.committedResult });

  if (inserted.length > 0) return { replayed: false, result };

  const [existing] = await db
    .select({ committedResult: idempotencyKeys.committedResult })
    .from(idempotencyKeys)
    .where(
      and(eq(idempotencyKeys.matchId, matchId), eq(idempotencyKeys.key, key)),
    );
  return { replayed: true, result: existing.committedResult };
}
