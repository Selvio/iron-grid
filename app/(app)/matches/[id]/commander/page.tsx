import { loadGameData } from "game-data";

import type { FactionId } from "@/app/components/faction-badge";
import {
  CommanderSelect,
  type CommanderOption,
} from "@/app/components/commander-select";
import { requireSessionUser } from "@/app/lib/session";

/**
 * Commander-selection screen (M9-T6).
 *
 * Gated server component. It reads the four commander slots from game data —
 * `display_name` is null (§33.1), so the client renders faction identity, not an
 * invented name.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T6)
 */

let cachedGameData: ReturnType<typeof loadGameData> | undefined;
function gameData(): ReturnType<typeof loadGameData> {
  cachedGameData ??= loadGameData();
  return cachedGameData;
}

export default async function CommanderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSessionUser();
  const { id } = await params;
  const commanders: CommanderOption[] = Object.values(
    gameData().commanders.commanders,
  ).map((commander) => ({
    id: commander.id,
    faction: commander.faction_id as FactionId,
  }));

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <CommanderSelect matchId={id} commanders={commanders} />
    </main>
  );
}
