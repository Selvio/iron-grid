import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * `users` and the app-owned identity columns (M4-T2).
 *
 * Extends the Auth.js base user (id/name/email/emailVerified/image) with the
 * gameplay-owned `notification_preferences` and `created_at` (`database.md`
 * §5.1). The Auth.js adapter is wired in M5; this lands the DDL so that wiring
 * needs no migration scramble. Column shape follows the official
 * `@auth/drizzle-adapter` Postgres schema; the Drizzle property names are what
 * the adapter references.
 *
 * @see docs/03-architecture/database.md §5.1
 * @see docs/03-architecture/backend.md §7
 * @see https://authjs.dev/getting-started/adapters/drizzle
 */

/** Per-type notification toggles (`rules.yaml` → notifications, spec §26.2). */
export interface NotificationPreferences {
  readonly match_invitation: boolean;
  readonly turn_started: boolean;
  readonly turn_reminder: boolean;
  readonly turn_expired: boolean;
  readonly match_completed: boolean;
}

/** Defaults from `rules.yaml` → notifications.default_preferences (§26.2). */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  match_invitation: true,
  turn_started: true,
  turn_reminder: true,
  turn_expired: false,
  match_completed: true,
};

export const users = pgTable("users", {
  id: text()
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  name: text(),
  email: text().notNull().unique(),
  emailVerified: timestamp({ withTimezone: true }),
  image: text(),
  notificationPreferences: jsonb()
    .$type<NotificationPreferences>()
    .notNull()
    .default(DEFAULT_NOTIFICATION_PREFERENCES),
  createdAt: timestamp({ withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

/** A selected `users` row. */
export type UserRow = typeof users.$inferSelect;
/** An insertable `users` row. */
export type NewUserRow = typeof users.$inferInsert;
