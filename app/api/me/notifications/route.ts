import {
  handleGetNotifications,
  handlePatchNotifications,
} from "@/app/server/account/notifications-endpoint";
import { createDatabase, type Database } from "@/app/server/db";

/**
 * Account endpoint: read and update the caller's notification preferences (M5-T5).
 *
 * `GET` returns the authenticated user's stored toggles; `PATCH` merges a
 * validated subset and returns the updated set (`backend.md` §3, §10; spec §26.2).
 * **Self-authorized** via `requireUser` — a user edits only their own row, so no
 * match membership is involved. It stores intent only: **no** email is sent and
 * **no** `notification_jobs` row is written (that delivery is M8).
 *
 * The behavior lives in `notifications-endpoint.ts` (integration-tested against
 * PGlite); this file only injects the live database and mounts the handlers.
 * Pinned to the Node.js runtime: it reads the transactional database through the
 * Drizzle client, which the Edge runtime cannot serve (`backend.md` §2).
 *
 * @see app/server/account/notifications-endpoint.ts
 * @see docs/03-architecture/backend.md §2, §3, §10
 * @see docs/04-development/milestones/m5-auth.md (M5-T5)
 */
export const runtime = "nodejs";

// Memoized per process, like the auth config: the pooled client is reused across
// requests and created lazily so importing the route touches neither env nor net.
let cachedDatabase: Database | undefined;
function database(): Database {
  cachedDatabase ??= createDatabase();
  return cachedDatabase;
}

export async function GET(): Promise<Response> {
  return handleGetNotifications({ db: database() });
}

export async function PATCH(request: Request): Promise<Response> {
  return handlePatchNotifications(request, { db: database() });
}
