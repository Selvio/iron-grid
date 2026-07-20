import { notFound } from "next/navigation";

import type { FactionId } from "@/app/components/faction-badge";
import { ReadyCheck, type ReadySeat } from "@/app/components/ready-check";
import { formatMapName } from "@/app/lib/format";
import { requireSessionUser } from "@/app/lib/session";
import { createDatabase, type Database } from "@/app/server/db";
import { getReadyCheckForUser } from "@/app/server/db/queries/matches";
import type { MatchSettings } from "@/app/server/db/schema/matches";

/**
 * Ready-check screen (M9-T6). Gated.
 *
 * A server component: it gates on the session, then reads both seats with the
 * membership-scoped `getReadyCheckForUser` so the design's per-player rows
 * (insignia, ready state) render server-side. A non-member — or an unknown match
 * — is a 404, so the id in the URL discloses nothing.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T6)
 */

// The pooled client is reused across requests within a warm runtime.
let cachedDatabase: Database | undefined;
function database(): Database {
  cachedDatabase ??= createDatabase();
  return cachedDatabase;
}

/** The settings line's turn-length wording (`create-match-form` options). */
const TURN_LENGTH: Record<MatchSettings["turnDeadline"], string> = {
  "24h": "24-hour",
  "3d": "3-day",
  "7d": "7-day",
  none: "untimed",
};

export default async function ReadyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireSessionUser();
  const { id } = await params;
  const match = await getReadyCheckForUser(database(), id, user.id);
  if (match === null) notFound();

  const seats: ReadySeat[] = match.seats.map((seat) => ({
    playerId: seat.playerId,
    faction: (seat.factionId as FactionId | null) ?? null,
    isReady: seat.isReady,
    isViewer: seat.isViewer,
  }));

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-12">
      <ReadyCheck
        matchId={id}
        seats={seats}
        summary={{
          mapName: formatMapName(match.mapId),
          turnLength: TURN_LENGTH[match.settings.turnDeadline],
          fogEnabled: match.settings.fogEnabled,
        }}
      />
    </main>
  );
}
