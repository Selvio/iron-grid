import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
  users,
} from "../db/schema/users";

/**
 * Notification-preferences account service (M5-T5).
 *
 * The read/update/validate logic behind `GET`/`PATCH /api/me/notifications`
 * (`backend.md` §3, §10; spec §26.2). **Preferences only** — this stores the
 * user's per-type email toggles; it sends no mail and writes no `notification_jobs`
 * (those triggers are M8). The endpoint is **self-authorized**: it reads the
 * caller's own row, so no match membership is involved.
 *
 * The db handle is threaded like the M4 primitives so the route can pass its
 * client; functions stay pure of `process.env` and testable against PGlite.
 *
 * @see docs/03-architecture/backend.md §3, §10
 * @see docs/04-development/milestones/m5-auth.md (M5-T5)
 */

/**
 * The exact toggle keys a client may set — derived from the M4 defaults, which
 * mirror `rules.yaml` → `notifications.default_preferences`, so no invented key
 * can slip in and the accepted set tracks the canonical rules automatically.
 */
export const NOTIFICATION_PREFERENCE_KEYS = Object.keys(
  DEFAULT_NOTIFICATION_PREFERENCES,
) as readonly (keyof NotificationPreferences)[];

/**
 * A rejected preferences `PATCH` body — a typed 400. Not a gameplay-action
 * validation, so it carries no `enums.validation_error_codes` code; the message
 * names only the offending key (never anything secret).
 */
export class PreferencesValidationError extends Error {
  readonly status = 400 as const;

  constructor(message: string) {
    super(message);
    this.name = "PreferencesValidationError";
  }
}

/**
 * Validates a raw `PATCH` body into a partial preferences update.
 *
 * Every key must be one of {@link NOTIFICATION_PREFERENCE_KEYS} and every value a
 * boolean; unknown keys and non-boolean values are rejected, and an empty body is
 * rejected since a `PATCH` must target at least one toggle. Omitted keys are left
 * for the caller to preserve (see {@link updateNotificationPreferences}).
 *
 * @throws {@link PreferencesValidationError} on any malformed or unknown input.
 */
export function parseNotificationPreferencesPatch(
  input: unknown,
): Partial<NotificationPreferences> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new PreferencesValidationError(
      "Request body must be a JSON object of notification-preference toggles.",
    );
  }

  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0) {
    throw new PreferencesValidationError(
      "Provide at least one notification preference to update.",
    );
  }

  const patch: Partial<Record<keyof NotificationPreferences, boolean>> = {};
  for (const [key, value] of entries) {
    if (
      !NOTIFICATION_PREFERENCE_KEYS.includes(
        key as keyof NotificationPreferences,
      )
    ) {
      throw new PreferencesValidationError(
        `Unknown notification preference: ${key}.`,
      );
    }
    if (typeof value !== "boolean") {
      throw new PreferencesValidationError(
        `Notification preference ${key} must be a boolean.`,
      );
    }
    patch[key as keyof NotificationPreferences] = value;
  }
  return patch;
}

/**
 * Returns the user's stored preferences, or `null` when no such user exists (a
 * session whose row has vanished — the route treats it as unauthenticated).
 */
export async function getNotificationPreferences<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(
  db: PgDatabase<TQuery, TSchema>,
  userId: string,
): Promise<NotificationPreferences | null> {
  const [row] = await db
    .select({ prefs: users.notificationPreferences })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.prefs ?? null;
}

/**
 * Merges `patch` into the user's stored preferences and returns the full updated
 * set, or `null` when no such user exists.
 *
 * The `jsonb ||` merge overrides only the supplied keys and leaves the rest
 * intact, in one atomic statement — no read-modify-write race.
 */
export async function updateNotificationPreferences<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(
  db: PgDatabase<TQuery, TSchema>,
  userId: string,
  patch: Partial<NotificationPreferences>,
): Promise<NotificationPreferences | null> {
  const [row] = await db
    .update(users)
    .set({
      notificationPreferences: sql`${users.notificationPreferences} || ${JSON.stringify(
        patch,
      )}::jsonb`,
    })
    .where(eq(users.id, userId))
    .returning({ prefs: users.notificationPreferences });
  return row?.prefs ?? null;
}
