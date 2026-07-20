import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import type { FactionId } from "@/app/components/faction-badge";
import {
  MatchCompleted,
  type CompletedSeat,
  type CompletionReason,
} from "@/app/components/match-completed";
import { formatMapName } from "@/app/lib/format";
import { requireSessionUser } from "@/app/lib/session";
import { requireMatchMembership } from "@/app/server/auth/membership";
import { createDatabase, type Database } from "@/app/server/db";
import { getMatchStats } from "@/app/server/db/queries/match-stats";
import { matchPlayers } from "@/app/server/db/schema/match-players";
import { matches } from "@/app/server/db/schema/matches";
import { users } from "@/app/server/db/schema/users";
import { getGameData } from "@/app/server/load-game-data";

/**
 * Completed-match screen (M9-T7).
 *
 * Gated server component. It confirms membership (a non-member is a 404, no
 * leak), reads the winner + completion reason from the mirror columns, and
 * aggregates each side's battle statistics from the event log (`getMatchStats`).
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T7)
 */

let cachedDatabase: Database | undefined;
function database(): Database {
  cachedDatabase ??= createDatabase();
  return cachedDatabase;
}

/** Activation → completion as a compact human duration. */
function formatDuration(from: Date | null, to: Date | null): string | null {
  if (from === null || to === null) return null;
  const minutes = Math.max(
    0,
    Math.round((to.getTime() - from.getTime()) / 60_000),
  );
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
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
      status: matches.status,
      winnerPlayerId: matches.winnerPlayerId,
      completionReason: matches.completionReason,
      mapId: matches.mapId,
      dayCounter: matches.dayCounter,
      activatedAt: matches.activatedAt,
      completedAt: matches.completedAt,
    })
    .from(matches)
    .where(eq(matches.id, id));

  // Only a genuinely completed match shows the summary; anything else (a match
  // still in play reached by a stale/direct URL) is a 404, not a bogus card.
  if (row === undefined || row.status !== "completed") {
    notFound();
  }

  // The seats plus who held them. Name with an email fallback is the identity
  // the dashboard row already shows an opponent by (M9-T9): magic-link accounts
  // often have no display name, and a results table that cannot say who you
  // played is not a record of anything.
  const players = await db
    .select({
      playerId: matchPlayers.id,
      role: matchPlayers.role,
      factionId: matchPlayers.factionId,
      name: users.name,
      email: users.email,
    })
    .from(matchPlayers)
    .leftJoin(users, eq(users.id, matchPlayers.userId))
    .where(eq(matchPlayers.matchId, id));

  const stats = await getMatchStats(db, id, row.mapId, players, getGameData());

  const seats: CompletedSeat[] = players
    .map((player) => ({
      playerId: player.playerId,
      faction: (player.factionId as FactionId | null) ?? null,
      label: player.name ?? player.email,
      isViewer: player.playerId === viewerPlayerId,
      isWinner: player.playerId === row.winnerPlayerId,
      ...(stats[player.playerId] ?? {
        unitsLost: 0,
        damageDealt: 0,
        captures: 0,
        unitsBuilt: 0,
      }),
    }))
    // The winner leads the table, as the design shows it.
    .sort((a, b) => Number(b.isWinner) - Number(a.isWinner));

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-12">
      <MatchCompleted
        viewerPlayerId={viewerPlayerId}
        winnerPlayerId={row.winnerPlayerId}
        completionReason={row.completionReason as CompletionReason | null}
        seats={seats}
        summary={{
          mapName: formatMapName(row.mapId),
          day: row.dayCounter,
          duration: formatDuration(row.activatedAt, row.completedAt),
        }}
      />
    </main>
  );
}
