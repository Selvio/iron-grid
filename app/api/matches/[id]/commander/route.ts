import { loadGameData } from "game-data";

import { handleSelectCommander } from "@/app/server/lifecycle/commander";
import { createDatabase, type Database } from "@/app/server/db";

/**
 * `POST /api/matches/:id/commander` — select commander + faction (M6-T4).
 *
 * Thin wrapper injecting the live database and reference data into the tested
 * `handleSelectCommander`. Node.js runtime (row lock + transactional writes).
 *
 * @see app/server/lifecycle/commander.ts
 * @see docs/04-development/milestones/m6-lifecycle.md (M6-T4)
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

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return handleSelectCommander(request, id, {
    db: database(),
    gameData: gameData(),
  });
}
