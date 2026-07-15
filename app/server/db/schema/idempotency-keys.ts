import { sql } from "drizzle-orm";
import {
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { matches } from "./matches";

/**
 * `idempotency_keys` — exactly-once mutation support (M4-T6).
 *
 * Every mutation carries a client-supplied `key`; a duplicate returns the stored
 * `committed_result` rather than re-applying (`action_processing.idempotency`).
 * The natural key `(match_id, key)` is the primary key, giving the uniqueness
 * `database.md` §5.6 requires. The pipeline that writes this (M7) uses
 * `recordIdempotentResult` (`queries/idempotency.ts`).
 *
 * @see docs/03-architecture/database.md §5.6
 * @see docs/02-data/rules.yaml → action_processing.idempotency
 */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    key: text().notNull(),
    matchId: text()
      .notNull()
      .references(() => matches.id),
    /** The original response, replayed verbatim on a duplicate key. */
    committedResult: jsonb().notNull(),
    createdAt: timestamp({ withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [primaryKey({ columns: [table.matchId, table.key] })],
);

/** A selected `idempotency_keys` row. */
export type IdempotencyKeyRow = typeof idempotencyKeys.$inferSelect;
/** An insertable `idempotency_keys` row. */
export type NewIdempotencyKeyRow = typeof idempotencyKeys.$inferInsert;
