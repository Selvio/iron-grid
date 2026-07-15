import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { eventType } from "./enums";
import { matchPlayers } from "./match-players";
import { matches } from "./matches";

/**
 * `player_events` — the per-player, client-safe projections (M4-T5).
 *
 * Produced by `create_player_event_projections` in the action pipeline
 * (`backend.md` §4); each row mirrors the authoritative `sequence` it derives
 * from, with a visibility-filtered `payload`. Replay reads this table, never
 * `events` (`database.md` §5.5). The projections are *written* here but
 * *computed* by the engine's `projectStateForPlayer` in M7 — M4 stores what it
 * is handed.
 *
 * @see docs/03-architecture/database.md §5.5
 * @see docs/02-data/rules.yaml → replay_rules.player_projections_safe_for_client
 */
export const playerEvents = pgTable(
  "player_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    matchId: text()
      .notNull()
      .references(() => matches.id),
    /** The viewer whose visibility this projection respects. */
    playerId: text()
      .notNull()
      .references(() => matchPlayers.id),
    /** Matches the authoritative sequence it derives from. */
    sequence: integer().notNull(),
    type: eventType().notNull(),
    /** Visibility-filtered payload. */
    payload: jsonb().notNull(),
    createdAt: timestamp({ withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index("player_events_match_player_sequence_idx").on(
      table.matchId,
      table.playerId,
      table.sequence,
    ),
  ],
);

/** A selected `player_events` row. */
export type PlayerEventRow = typeof playerEvents.$inferSelect;
/** An insertable `player_events` row. */
export type NewPlayerEventRow = typeof playerEvents.$inferInsert;
