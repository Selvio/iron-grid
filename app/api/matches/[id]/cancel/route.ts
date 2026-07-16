import { handleCancelMatch } from "@/app/server/lifecycle/cancel";
import { createDatabase, type Database } from "@/app/server/db";

/**
 * `POST /api/matches/:id/cancel` — cancel a pre-active match (M6-T6).
 *
 * Thin wrapper injecting the live database into the tested `handleCancelMatch`.
 * Node.js runtime (row lock + transactional write).
 *
 * @see app/server/lifecycle/cancel.ts
 * @see docs/04-development/milestones/m6-lifecycle.md (M6-T6)
 */
export const runtime = "nodejs";

let cachedDatabase: Database | undefined;
function database(): Database {
  cachedDatabase ??= createDatabase();
  return cachedDatabase;
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return handleCancelMatch(id, { db: database() });
}
