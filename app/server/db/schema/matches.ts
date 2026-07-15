import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { MatchState } from "game-engine";

import { completionReason, matchStatus } from "./enums";

/**
 * `matches` — the aggregate root and authoritative-state carrier (M4-T3).
 *
 * The engine's serialized `state` snapshot lives in one `jsonb` column
 * (`database.md` §3); relational columns hold only what the backend must lock,
 * filter or schedule without deserializing it. Selected snapshot fields are
 * **mirrored** as indexed columns (`state_version`, `active_player_id`,
 * `day_counter`, `turn_deadline_at`) and kept in lockstep by
 * `persistMatchSnapshot` (`queries/matches.ts`).
 *
 * Nullability follows the lifecycle: identity/settings are set at creation
 * (`draft`); the pinned `game_data_version`, `random_seed`, `state` and the
 * turn/active-player mirrors arrive at activation; winner/completion at the end.
 *
 * @see docs/03-architecture/database.md §5.2, §3
 * @see docs/03-architecture/domain-model.md §6
 */

/**
 * Host-chosen match settings (`game-specification.md` §3.2). Opaque to M4 — its
 * shape is refined as match lifecycle lands (M6). `dayLimit` scoring is gated
 * (§33.2); the limit value itself is storable.
 */
export interface MatchSettings {
  readonly fogEnabled: boolean;
  readonly turnDeadline: "24h" | "3d" | "7d" | "none";
  readonly dayLimit: number | null;
}

export const matches = pgTable(
  "matches",
  {
    id: text().primaryKey(),
    status: matchStatus().notNull(),
    mapId: text().notNull(),
    settings: jsonb().$type<MatchSettings>().notNull(),
    /** Six unambiguous alphanumerics (§3.3); generation is M6. */
    invitationCode: text().notNull(),
    /** Pinned at activation, immutable thereafter (`database.md` §8). */
    gameDataVersion: text(),
    /** Server-owned determinism seed, set at activation (spec §12.6). */
    randomSeed: text(),
    /** Optimistic-concurrency counter; T7 owns the compare-and-increment. */
    stateVersion: integer().notNull().default(0),
    // Mirrors of the snapshot's match meta, for indexing/locking/scheduling.
    // The player references are plain-text mirrors (no FK) so the aggregate root
    // avoids a circular matches <-> match_players constraint; match_players holds
    // the authoritative FK direction.
    activePlayerId: text(),
    dayCounter: integer().notNull().default(0),
    turnDeadlineAt: timestamp({ withTimezone: true }),
    /** Serialized authoritative engine state; null until activation. */
    state: jsonb().$type<MatchState>(),
    winnerPlayerId: text(),
    completionReason: completionReason(),
    createdAt: timestamp({ withTimezone: true })
      .notNull()
      .default(sql`now()`),
    activatedAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex("matches_invitation_code_key").on(table.invitationCode),
    index("matches_status_idx").on(table.status),
    index("matches_turn_deadline_at_idx").on(table.turnDeadlineAt),
    index("matches_active_player_id_idx").on(table.activePlayerId),
  ],
);

/** A selected `matches` row. */
export type MatchRow = typeof matches.$inferSelect;
/** An insertable `matches` row. */
export type NewMatchRow = typeof matches.$inferInsert;
