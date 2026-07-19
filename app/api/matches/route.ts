import { getGameData } from "@/app/server/load-game-data";

import { handleCreateMatch } from "@/app/server/lifecycle/create";
import { handleListMatches } from "@/app/server/lifecycle/list";
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

export async function POST(request: Request): Promise<Response> {
  return handleCreateMatch(request, {
    db: database(),
    gameData: getGameData(),
  });
}

/**
 * `GET /api/matches` — the caller's match list for the dashboard (M9-T4).
 *
 * Injects the live database into the tested `handleListMatches`. Node.js runtime
 * for the same reasons as `POST` — it reads the transactional database.
 *
 * @see app/server/lifecycle/list.ts
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T4)
 */
export async function GET(): Promise<Response> {
  return handleListMatches({ db: database() });
}
