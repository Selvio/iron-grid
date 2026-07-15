import { boolean, index, pgTable, text, unique } from "drizzle-orm/pg-core";

import { matchPlayerRole } from "./enums";
import { matches } from "./matches";

/**
 * `match_players` — per-match identity and setup (M4-T4).
 *
 * Holds only the participant's identity and pre-match choices. Mutable per-turn
 * gameplay values (funds, power meter, acted flags) live in `matches.state` so
 * the engine snapshot stays the single authoritative source (`database.md` §5.3).
 *
 * `faction_id` and `commander_id` are opaque references (into `commanders.yaml`,
 * gated by §33.1) that are null until commander selection (M6); Postgres treats
 * null as distinct, so the composite uniqueness permits multiple unselected rows
 * yet forbids two players sharing a faction or commander once chosen (§3.4).
 *
 * `match_id` references `matches`; the `user_id` FK to `users` is added with that
 * table (M4-T2), so the column is a plain nullable text for now.
 *
 * @see docs/03-architecture/database.md §5.3
 * @see docs/03-architecture/domain-model.md §7
 */
export const matchPlayers = pgTable(
  "match_players",
  {
    id: text().primaryKey(),
    matchId: text()
      .notNull()
      .references(() => matches.id),
    /** Null until the invitation is accepted; FK to `users` lands in M4-T2. */
    userId: text(),
    role: matchPlayerRole().notNull(),
    /** Blue/Green/Red/Yellow — determined by commander choice (§22.1). */
    factionId: text(),
    commanderId: text(),
    isReady: boolean().notNull().default(false),
  },
  (table) => [
    unique("match_players_match_faction_key").on(
      table.matchId,
      table.factionId,
    ),
    unique("match_players_match_commander_key").on(
      table.matchId,
      table.commanderId,
    ),
    index("match_players_user_id_idx").on(table.userId),
  ],
);

/** A selected `match_players` row. */
export type MatchPlayerRow = typeof matchPlayers.$inferSelect;
/** An insertable `match_players` row. */
export type NewMatchPlayerRow = typeof matchPlayers.$inferInsert;
