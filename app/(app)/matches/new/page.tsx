import { getGameData } from "@/app/server/load-game-data";

import {
  CreateMatchForm,
  type MapOption,
} from "@/app/components/create-match-form";
import { requireSessionUser } from "@/app/lib/session";

/**
 * Create-match screen (M9-T5).
 *
 * Gated server component: it loads the official map catalogue and hands the
 * options to the client form. The catalogue is `official_maps: {}` (design-
 * blocked, §33) until M10, so today the form renders its explicit no-maps state;
 * it comes to life the moment the first map lands.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T5)
 */

export default async function NewMatchPage() {
  await requireSessionUser();
  const maps: MapOption[] = Object.values(getGameData().maps).map((map) => ({
    id: map.id,
    label: `${map.id} · ${map.dimensions.width}×${map.dimensions.height}`,
  }));

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-12">
      <CreateMatchForm maps={maps} />
    </main>
  );
}
