import { requireCronSecret } from "@/app/server/auth";
import { createDatabase, type Database } from "@/app/server/db";
import { drainNotifications } from "@/app/server/notifications/drain";

/**
 * `GET /api/cron/notifications` — the scheduled notification drain (M8-T6).
 *
 * Invoked by Vercel Cron (see `vercel.json`), which presents `CRON_SECRET` as a
 * bearer token; unauthenticated calls are rejected. Delivers due
 * `notification_jobs` via Resend outside any gameplay transaction — a delivery
 * failure never affects match state (`notifications.gameplay_authority: false`).
 * Node.js runtime (transactional database access).
 *
 * @see app/server/notifications/drain.ts
 * @see docs/04-development/milestones/m8-async-notifications.md (M8-T6)
 */
export const runtime = "nodejs";

let cachedDatabase: Database | undefined;
function database(): Database {
  cachedDatabase ??= createDatabase();
  return cachedDatabase;
}

export async function GET(request: Request): Promise<Response> {
  if (
    request.headers.get("authorization") !== `Bearer ${requireCronSecret()}`
  ) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await drainNotifications({ db: database() });
  return Response.json(result);
}
