import { getGameData } from "@/app/server/load-game-data";

import { handleGetMatch } from "@/app/server/actions/read";
import { createDatabase, type Database } from "@/app/server/db";

/**
 * `GET /api/matches/:id` — the caller's player-projected match view (M7-T6).
 *
 * Thin wrapper injecting the live database and reference data into the tested
 * `handleGetMatch`. Node.js runtime (transactional database access).
 *
 * @see app/server/actions/read.ts
 * @see docs/04-development/milestones/m7-actions.md (M7-T6)
 */
export const runtime = "nodejs";

let cachedDatabase: Database | undefined;
function database(): Database {
  cachedDatabase ??= createDatabase();
  return cachedDatabase;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return handleGetMatch(id, { db: database(), gameData: getGameData() });
}
