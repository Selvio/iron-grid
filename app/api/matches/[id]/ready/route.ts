import { getGameData } from "@/app/server/load-game-data";

import { handleReadyMatch } from "@/app/server/lifecycle/ready";
import { createDatabase, type Database } from "@/app/server/db";

/**
 * `POST /api/matches/:id/ready` — confirm ready; activate when both ready (M6-T5).
 *
 * Thin wrapper injecting the live database and reference data into the tested
 * `handleReadyMatch`. Node.js runtime (row lock, transactional activation).
 *
 * @see app/server/lifecycle/ready.ts
 * @see docs/04-development/milestones/m6-lifecycle.md (M6-T5)
 */
export const runtime = "nodejs";

let cachedDatabase: Database | undefined;
function database(): Database {
  cachedDatabase ??= createDatabase();
  return cachedDatabase;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return handleReadyMatch(request, id, {
    db: database(),
    gameData: getGameData(),
  });
}
