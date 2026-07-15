import { sql } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { eventType } from "./enums";
import { matches } from "./matches";

/**
 * `events` — the authoritative, append-only record of what happened (M4-T5).
 *
 * The durable, private source of truth (`database.md` §5.4, §7). Rows are only
 * ever inserted, through `appendEvents` (`queries/events.ts`); there is no
 * UPDATE/DELETE path in application code (`security_rules`), guarded by
 * `append-only.test.ts`. `sequence` is per-match, starts at 1 and is contiguous;
 * `unique(match_id, sequence)` enforces order integrity. Authoritative events are
 * never sent to clients — only the `player_events` projections are.
 *
 * @see docs/03-architecture/database.md §5.4, §7
 * @see docs/02-data/rules.yaml → replay_rules
 */
export const events = pgTable(
  "events",
  {
    id: uuid().primaryKey().defaultRandom(),
    matchId: text()
      .notNull()
      .references(() => matches.id),
    /** Per-match, contiguous from 1 (`replay_rules`). */
    sequence: integer().notNull(),
    type: eventType().notNull(),
    /** Fully resolved values (`replay_rules.combat_event_fields`, spec §24.5). */
    payload: jsonb().notNull(),
    createdAt: timestamp({ withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    uniqueIndex("events_match_sequence_key").on(table.matchId, table.sequence),
  ],
);

/** A selected authoritative `events` row. */
export type EventRow = typeof events.$inferSelect;
/** An insertable `events` row. */
export type NewEventRow = typeof events.$inferInsert;
