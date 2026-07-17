import { terrainMovementCost, type Coordinate } from "game-engine";
import type { GameData } from "game-data";

import type { MatchView } from "@/app/lib/api-client";

import { matchViewToState } from "./match-state-adapter";

/**
 * Client-side path to a reachable destination (M10-T7).
 *
 * `move_and_wait` submits the ordered traversed path, but `calculateMovementRange`
 * returns only the reachable set. This computes a least-cost path with Dijkstra,
 * reusing the engine's own `terrainMovementCost` so the per-tile costs match the
 * server. Enemy-occupied tiles block passage. Advisory: the server re-validates
 * the path on submit; a bad path is rejected, never applied. Returns `null` when
 * the destination is not reachable.
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T7)
 */
export function computePath(
  view: MatchView,
  unitId: string,
  destination: Coordinate,
  gameData: GameData,
): Coordinate[] | null {
  const state = matchViewToState(view);
  const unit = state.units.find((u) => u.id === unitId);
  if (unit === undefined || unit.position === null) return null;

  const def = gameData.units[unit.typeId];
  if (def === undefined) return null;
  const movementType = def.movement.type;
  const origin = unit.position;
  const key = (c: Coordinate): string => `${c.x},${c.y}`;

  const blocked = new Set(
    view.units
      .filter(
        (u) => u.ownerPlayerId !== unit.ownerPlayerId && u.position !== null,
      )
      .map((u) => key(u.position!)),
  );

  const dist = new Map<string, number>([[key(origin), 0]]);
  const prev = new Map<string, Coordinate>();
  const queue: { coord: Coordinate; d: number }[] = [{ coord: origin, d: 0 }];

  while (queue.length > 0) {
    queue.sort((a, b) => a.d - b.d);
    const { coord, d } = queue.shift()!;
    if (d > (dist.get(key(coord)) ?? Infinity)) continue;

    const neighbors: Coordinate[] = [
      { x: coord.x + 1, y: coord.y },
      { x: coord.x - 1, y: coord.y },
      { x: coord.x, y: coord.y + 1 },
      { x: coord.x, y: coord.y - 1 },
    ];
    for (const n of neighbors) {
      if (
        n.x < 0 ||
        n.y < 0 ||
        n.x >= view.map.width ||
        n.y >= view.map.height
      ) {
        continue;
      }
      if (blocked.has(key(n))) continue;
      const cost = terrainMovementCost(gameData, view.mapId, n, movementType);
      if (cost === null) continue;
      const nd = d + cost;
      if (nd < (dist.get(key(n)) ?? Infinity)) {
        dist.set(key(n), nd);
        prev.set(key(n), coord);
        queue.push({ coord: n, d: nd });
      }
    }
  }

  if (!dist.has(key(destination))) return null;
  const path: Coordinate[] = [];
  let cursor: Coordinate | undefined = destination;
  while (cursor !== undefined) {
    path.unshift(cursor);
    cursor = prev.get(key(cursor));
  }
  return path;
}
