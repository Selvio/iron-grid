import { loadGameData } from "game-data";

import { handleGetEvents } from "@/app/server/actions/read";
import { createDatabase, type Database } from "@/app/server/db";

/**
 * `GET /api/matches/:id/events?since=` — the viewer's projected events (M7-T6).
 *
 * Thin wrapper injecting the live database into the tested `handleGetEvents`.
 * Node.js runtime (transactional database access).
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

let cachedGameData: ReturnType<typeof loadGameData> | undefined;
function gameData(): ReturnType<typeof loadGameData> {
  cachedGameData ??= loadGameData();
  return cachedGameData;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const sinceParam = new URL(request.url).searchParams.get("since");
  const since = Number.parseInt(sinceParam ?? "0", 10);
  return handleGetEvents(id, Number.isNaN(since) ? 0 : since, {
    db: database(),
    gameData: gameData(),
  });
}
