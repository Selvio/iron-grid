import { getGameData } from "@/app/server/load-game-data";

import { handleSubmitAction } from "@/app/server/actions/submit";
import { createDatabase, type Database } from "@/app/server/db";

/**
 * `POST /api/matches/:id/actions` — submit a gameplay action (M7-T3).
 *
 * Thin wrapper injecting the live database and reference data into the tested
 * `handleSubmitAction`, which runs the transactional `action_processing` pipeline.
 * Node.js runtime — it holds the match row lock and writes transactionally
 * (`backend.md` §2).
 *
 * @see app/server/actions/submit.ts
 * @see docs/04-development/milestones/m7-actions.md (M7-T3)
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
  return handleSubmitAction(request, id, {
    db: database(),
    gameData: getGameData(),
  });
}
