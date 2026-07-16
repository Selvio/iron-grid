import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { UnauthenticatedError } from "../auth/errors";
import { requireUser, type SessionResolver } from "../auth/session";

import { errorResponse } from "./http";
import {
  getNotificationPreferences,
  parseNotificationPreferencesPatch,
  PreferencesValidationError,
  updateNotificationPreferences,
} from "./notification-preferences";

/**
 * Testable request logic behind `GET`/`PATCH /api/me/notifications` (M5-T5).
 *
 * The route file is a thin adapter that wires the real database and session; this
 * module holds the actual behavior — `requireUser` → read/merge → typed response
 * — so it can be integration-tested against PGlite with an injected session,
 * without booting Auth.js / the Next server runtime. Dependencies (db and the
 * session resolver) are injected via {@link NotificationsEndpointDeps}; the route
 * passes the live handle, tests pass a PGlite handle and a seeded resolver.
 *
 * @see app/api/me/notifications/route.ts
 * @see docs/04-development/milestones/m5-auth.md (M5-T5)
 */
export interface NotificationsEndpointDeps<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
> {
  /** The database handle to read/update preferences through. */
  readonly db: PgDatabase<TQuery, TSchema>;
  /** Session source; omitted in production so `requireUser` reads the request. */
  readonly resolveSession?: SessionResolver;
}

/** `GET`: return the authenticated user's stored preferences, or a typed error. */
export async function handleGetNotifications<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(deps: NotificationsEndpointDeps<TQuery, TSchema>): Promise<Response> {
  try {
    const user = await requireUser(deps.resolveSession);
    const preferences = await getNotificationPreferences(deps.db, user.id);
    if (preferences === null) {
      // A valid session whose user row no longer exists — treat as signed out.
      throw new UnauthenticatedError();
    }
    return Response.json(preferences);
  } catch (error) {
    return errorResponse(error);
  }
}

/** `PATCH`: validate and merge the toggle subset, returning the updated set. */
export async function handlePatchNotifications<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(
  request: Request,
  deps: NotificationsEndpointDeps<TQuery, TSchema>,
): Promise<Response> {
  try {
    const user = await requireUser(deps.resolveSession);
    const body = await request.json().catch(() => {
      throw new PreferencesValidationError("Request body must be valid JSON.");
    });
    const patch = parseNotificationPreferencesPatch(body);
    const updated = await updateNotificationPreferences(
      deps.db,
      user.id,
      patch,
    );
    if (updated === null) {
      throw new UnauthenticatedError();
    }
    return Response.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
