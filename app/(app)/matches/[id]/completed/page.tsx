import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import {
  MatchCompleted,
  type CompletionReason,
} from "@/app/components/match-completed";
import { requireSessionUser } from "@/app/lib/session";
import { requireMatchMembership } from "@/app/server/auth/membership";
import { createDatabase, type Database } from "@/app/server/db";
import { matches } from "@/app/server/db/schema/matches";

/**
 * Completed-match screen (M9-T7).
 *
 * Gated server component. It confirms membership (a non-member is a 404, no
 * leak) and reads the winner + completion reason from the mirror columns — the
 * outcome is fetched, since M9 submits no actions.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T7)
 */

let cachedDatabase: Database | undefined;
function database(): Database {
  cachedDatabase ??= createDatabase();
  return cachedDatabase;
}

export default async function CompletedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireSessionUser();
  const { id } = await params;
  const db = database();

  let viewerPlayerId: string;
  try {
    const membership = await requireMatchMembership(db, user.id, id);
    viewerPlayerId = membership.playerId;
  } catch {
    notFound();
  }

  const [row] = await db
    .select({
      winnerPlayerId: matches.winnerPlayerId,
      completionReason: matches.completionReason,
    })
    .from(matches)
    .where(eq(matches.id, id));

  if (row === undefined) {
    notFound();
  }

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-12">
      <MatchCompleted
        viewerPlayerId={viewerPlayerId}
        winnerPlayerId={row.winnerPlayerId}
        completionReason={row.completionReason as CompletionReason | null}
      />
    </main>
  );
}
