import {
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { notificationJobStatus, notificationType } from "./enums";
import { matchPlayers } from "./match-players";
import { matches } from "./matches";

/**
 * `notification_jobs` — durable notification jobs the cron drain delivers (M4-T6,
 * queries + dedupe M8-T4).
 *
 * The scheduler drains by `(status, scheduled_at)`; `dedupe_key` +
 * `unique(match_id, player_id, type, dedupe_key)` make enqueue idempotent per
 * turn (a `turn_reminder`/`turn_expired` is scheduled once). Notifications are
 * never gameplay-authoritative (`database.md` §5.7, `backend.md` §10).
 *
 * @see docs/03-architecture/database.md §5.7
 * @see docs/02-data/rules.yaml → notifications
 * @see docs/04-development/milestones/m8-async-notifications.md (M8-T4)
 */
export const notificationJobs = pgTable(
  "notification_jobs",
  {
    id: uuid().primaryKey().defaultRandom(),
    matchId: text()
      .notNull()
      .references(() => matches.id),
    playerId: text()
      .notNull()
      .references(() => matchPlayers.id),
    type: notificationType().notNull(),
    scheduledAt: timestamp({ withTimezone: true }).notNull(),
    sentAt: timestamp({ withTimezone: true }),
    status: notificationJobStatus().notNull().default("pending"),
    /** Dedupe token (e.g. the turn's deadline instant) — one job per turn/type. */
    dedupeKey: text().notNull(),
  },
  (table) => [
    index("notification_jobs_status_scheduled_at_idx").on(
      table.status,
      table.scheduledAt,
    ),
    unique("notification_jobs_dedupe_key").on(
      table.matchId,
      table.playerId,
      table.type,
      table.dedupeKey,
    ),
  ],
);

/** A selected `notification_jobs` row. */
export type NotificationJobRow = typeof notificationJobs.$inferSelect;
/** An insertable `notification_jobs` row. */
export type NewNotificationJobRow = typeof notificationJobs.$inferInsert;
