import { handleJoinMatch } from "@/app/server/lifecycle/join";
import { createDatabase, type Database } from "@/app/server/db";

/**
 * `POST /api/matches/join` — join by invitation code alone.
 *
 * Resolves the unique `invitation_code` to a waiting match, then runs the same
 * accept path as `POST /api/matches/:id/join`. Lets the dashboard join screen
 * work with only the six-character code the host shares.
 *
 * @see app/server/lifecycle/join.ts
 */
export const runtime = "nodejs";

let cachedDatabase: Database | undefined;
function database(): Database {
  cachedDatabase ??= createDatabase();
  return cachedDatabase;
}

export async function POST(request: Request): Promise<Response> {
  return handleJoinMatch(request, undefined, { db: database() });
}
