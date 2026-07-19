import { loadGameData, type GameData } from "game-data";

/**
 * Server-side game-data accessor.
 *
 * Production keeps one parsed copy (the YAML is immutable per deploy). In
 * development every call re-reads `docs/02-data/*.yaml` so map/atlas edits show
 * up without restarting `pnpm dev` — a module-level `??=` cache was leaving the
 * play page on a stale `spann-island` layout after YAML changes.
 */

let cached: GameData | undefined;

export function getGameData(): GameData {
  if (process.env.NODE_ENV !== "production") {
    return loadGameData();
  }
  cached ??= loadGameData();
  return cached;
}
