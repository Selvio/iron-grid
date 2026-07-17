import { loadGameData } from "game-data";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { BattlefieldView } from "@/app/components/battlefield/battlefield-view";
import { requireSessionUser } from "@/app/lib/session";
import { requireMatchMembership } from "@/app/server/auth/membership";
import { projectMatchView } from "@/app/server/actions/read";
import { createDatabase, type Database } from "@/app/server/db";
import { matches } from "@/app/server/db/schema/matches";

/**
 * Battlefield screen (M10-T2).
 *
 * Gated server component. It confirms membership (a non-member is a 404), reads
 * the authoritative match state and hands the caller their **fog-projected**
 * `MatchView` to the Phaser canvas. A match that has not started yet has no
 * engine state; the player is routed back to the dashboard.
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T2)
 */

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

export default async function PlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireSessionUser();
  const { id } = await params;
  const db = database();

  const [row] = await db
    .select({ state: matches.state })
    .from(matches)
    .where(eq(matches.id, id));

  if (row === undefined) notFound();
  if (row.state === null) redirect("/dashboard"); // not started yet

  // Prefer the active player's row so a practice/hotseat match (same user on both
  // sides) plays whichever army is active; a normal match resolves to your one row.
  let viewerPlayerId: string;
  try {
    const membership = await requireMatchMembership(
      db,
      user.id,
      id,
      row.state.match.activePlayerId,
    );
    viewerPlayerId = membership.playerId;
  } catch {
    notFound();
  }

  const data = gameData();
  const matchView = projectMatchView(row.state, viewerPlayerId, data);

  return (
    <div className="fixed inset-0 top-14 bg-background">
      <BattlefieldView matchView={matchView} gameData={data} />
    </div>
  );
}
