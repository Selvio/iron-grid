import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { EventType } from "game-engine";

import { type EventRow, events } from "../schema/events";
import { type NewPlayerEventRow, playerEvents } from "../schema/player-events";

/**
 * Append-only writers for the event store (M4-T5).
 *
 * These are the *only* application paths that write `events` / `player_events`,
 * and they only ever INSERT — there is no UPDATE or DELETE (`security_rules`;
 * enforced by `append-only.test.ts`). `appendEvents` computes the next contiguous
 * per-match sequence; the caller holds the match row lock (M4-T7) so the read is
 * serialized, and `unique(match_id, sequence)` rejects any duplicate a race would
 * produce.
 *
 * @see docs/03-architecture/database.md §7
 */

/** An authoritative event to append; its sequence is assigned by the store. */
export interface AppendEventInput {
  readonly type: EventType;
  readonly payload: unknown;
}

/**
 * Appends events to a match's authoritative log, assigning contiguous sequences
 * continuing from the current maximum (starting at 1 for the first). Returns the
 * inserted rows with their assigned sequences and generated ids.
 */
export async function appendEvents<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(
  db: PgDatabase<TQuery, TSchema>,
  matchId: string,
  inputs: readonly AppendEventInput[],
): Promise<EventRow[]> {
  if (inputs.length === 0) return [];

  const [current] = await db
    .select({ max: sql<number | null>`max(${events.sequence})` })
    .from(events)
    .where(eq(events.matchId, matchId));
  const start = (current?.max ?? 0) + 1;

  return db
    .insert(events)
    .values(
      inputs.map((input, offset) => ({
        matchId,
        sequence: start + offset,
        type: input.type,
        payload: input.payload,
      })),
    )
    .returning();
}

/**
 * Inserts pre-computed per-player projections (the engine produced them in M7).
 * Each row carries the authoritative sequence it derives from.
 */
export async function insertPlayerEvents<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(
  db: PgDatabase<TQuery, TSchema>,
  rows: readonly NewPlayerEventRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(playerEvents).values([...rows]);
}
