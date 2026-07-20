import { getGameData } from "@/app/server/load-game-data";

import { handleReadyMatch } from "@/app/server/lifecycle/ready";
import { handleGetReadyState } from "@/app/server/lifecycle/ready-state";
import { createDatabase, type Database } from "@/app/server/db";

/**
 * `POST /api/matches/:id/ready` — confirm ready; activate when both ready (M6-T5).
 * `GET` returns the same screen's live state so it can poll for the opponent
 * (M11-T1).
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

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return handleGetReadyState(id, { db: database() });
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
