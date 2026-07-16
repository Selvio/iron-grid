import { loadGameData } from "game-data";

import { handleCreateMatch } from "@/app/server/lifecycle/create";
import { createDatabase, type Database } from "@/app/server/db";

/**
 * `POST /api/matches` — create a match (M6-T2).
 *
 * Thin wrapper: injects the live database and reference data into the tested
 * `handleCreateMatch` (`app/server/lifecycle/create.ts`). Pinned to the Node.js
 * runtime — it writes the transactional database and reads game data from disk,
 * neither of which the Edge runtime can serve (`backend.md` §2).
 *
 * @see app/server/lifecycle/create.ts
 * @see docs/04-development/milestones/m6-lifecycle.md (M6-T2)
 */
export const runtime = "nodejs";

let cachedDatabase: Database | undefined;
function database(): Database {
  cachedDatabase ??= createDatabase();
  return cachedDatabase;
}

// Reference data is immutable per process; load once and reuse across requests.
let cachedGameData: ReturnType<typeof loadGameData> | undefined;
function gameData(): ReturnType<typeof loadGameData> {
  cachedGameData ??= loadGameData();
  return cachedGameData;
}

export async function POST(request: Request): Promise<Response> {
  return handleCreateMatch(request, { db: database(), gameData: gameData() });
}
