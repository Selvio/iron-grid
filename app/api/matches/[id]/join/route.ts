import { handleJoinMatch } from "@/app/server/lifecycle/join";
import { createDatabase, type Database } from "@/app/server/db";

/**
 * `POST /api/matches/:id/join` — a guest accepts an invitation (M6-T3).
 *
 * Thin wrapper injecting the live database into the tested `handleJoinMatch`.
 * Node.js runtime — it holds a row lock and writes transactionally
 * (`backend.md` §2).
 *
 * @see app/server/lifecycle/join.ts
 * @see docs/04-development/milestones/m6-lifecycle.md (M6-T3)
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
  return handleJoinMatch(request, id, { db: database() });
}
