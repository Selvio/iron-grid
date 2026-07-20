import { notFound, redirect } from "next/navigation";

import { getGameData } from "@/app/server/load-game-data";

import type { FactionId } from "@/app/components/faction-badge";
import {
  CommanderSelect,
  type CommanderOption,
} from "@/app/components/commander-select";
import { requireSessionUser } from "@/app/lib/session";
import { createDatabase, type Database } from "@/app/server/db";
import { getReadyCheckForUser } from "@/app/server/db/queries/matches";

/**
 * Commander-selection screen (M9-T6).
 *
 * Gated server component. It reads the four commander slots from game data —
 * `display_name` is null (§33.1), so the client renders faction identity, not an
 * invented name.
 *
 * Selection is final, so a caller whose seat already carries a faction is sent
 * on to the ready check rather than shown a picker that can only fail: the
 * dashboard links here by match status, which stays `commander_selection` until
 * *both* seats have chosen. A non-member (or unknown match) is a 404, matching
 * the ready screen.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T6)
 */

// The pooled client is reused across requests within a warm runtime.
let cachedDatabase: Database | undefined;
function database(): Database {
  cachedDatabase ??= createDatabase();
  return cachedDatabase;
}

export default async function CommanderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireSessionUser();
  const { id } = await params;

  const match = await getReadyCheckForUser(database(), id, user.id);
  if (match === null) notFound();
  const viewerSeat = match.seats.find((seat) => seat.isViewer);
  if (viewerSeat?.factionId != null) redirect(`/matches/${id}/ready`);

  const commanders: CommanderOption[] = Object.values(
    getGameData().commanders.commanders,
  ).map((commander) => {
    // Only an approved passive is shown — and only an approved passive is
    // applied by the engine (ADR-0006), so the card cannot advertise a trait
    // that does not run.
    const { display_name, description, status } = commander.passive;
    return {
      id: commander.id,
      faction: commander.faction_id as FactionId,
      passive:
        status === "approved" && display_name !== null && description !== null
          ? { name: display_name, description }
          : null,
    };
  });

  // What the other seat already holds, so its card renders unavailable. The
  // server remains the authority — a faction claimed after this render still
  // comes back as `commander_unavailable`.
  const takenFactions = match.seats
    .filter((seat) => !seat.isViewer && seat.factionId !== null)
    .map((seat) => seat.factionId as FactionId);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <CommanderSelect
        matchId={id}
        commanders={commanders}
        takenFactions={takenFactions}
      />
    </main>
  );
}
