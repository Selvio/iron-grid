import {
  calculateCombatPreview,
  calculateLegalActions,
  type AttackOption,
  type CombatPreview,
  type Coordinate,
} from "game-engine";
import type { GameData } from "game-data";

import type { MatchView } from "@/app/lib/api-client";

import { matchViewToState } from "./match-state-adapter";

/**
 * In-browser legal-action and combat previews (M10-T6).
 *
 * Non-authoritative wrappers over the same pure engine functions the server uses
 * (`frontend.md` §6; `game-specification.md` §11, §12.7). `previewUnitMenu`
 * digests `calculateLegalActions` into the per-unit action menu (the tiles it may
 * move/capture to and the attacks it may make); `actionsAtDestination` narrows
 * that to a single chosen tile (the Advance-Wars post-move menu); `previewCombat`
 * returns the min/max damage + counter forecast (no luck drawn). Advisory only —
 * the server re-validates on submit and the client discards the preview in favor
 * of the returned event on any disagreement.
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T6)
 */

/** The action menu for one unit this turn, derived from `calculateLegalActions`. */
export interface UnitMenu {
  /** Tiles the unit may end a `move_and_wait` on — its origin plus reachable. */
  readonly moveDestinations: readonly Coordinate[];
  /** Tiles the unit may capture a property from (origin and/or move tiles). */
  readonly captureDestinations: readonly Coordinate[];
  /** The (firing-tile, target) pairs the unit may attack. */
  readonly attacks: readonly AttackOption[];
}

/** The actions available to a unit from one chosen destination tile. */
export interface DestinationOptions {
  /** `move_and_wait` (or an attack-in-place move) may end here. */
  readonly canWait: boolean;
  /** A `capture` may be performed here. */
  readonly canCapture: boolean;
  /** The enemy unit ids attackable when firing from this tile. */
  readonly attackTargets: readonly string[];
}

const at = (a: Coordinate, x: number, y: number): boolean =>
  a.x === x && a.y === y;

/** The per-unit action menu (move/capture tiles + attacks) from the pure engine. */
export function previewUnitMenu(
  view: MatchView,
  unitId: string,
  gameData: GameData,
): UnitMenu {
  const legal = calculateLegalActions(
    matchViewToState(view),
    view.viewerPlayerId,
    gameData,
  );
  const forUnit = legal.filter((a) => a.unitId === unitId);
  const byType = (type: string) => forUnit.find((a) => a.type === type);
  return {
    moveDestinations: byType("move_and_wait")?.destinations ?? [],
    captureDestinations: byType("capture")?.destinations ?? [],
    attacks: byType("attack")?.attacks ?? [],
  };
}

/** Narrow a unit's menu to the actions legal from a single destination tile. */
export function actionsAtDestination(
  menu: UnitMenu,
  destination: Coordinate,
): DestinationOptions {
  const { x, y } = destination;
  return {
    canWait: menu.moveDestinations.some((c) => at(c, x, y)),
    canCapture: menu.captureDestinations.some((c) => at(c, x, y)),
    attackTargets: menu.attacks
      .filter((a) => at(a.from, x, y))
      .map((a) => a.targetUnitId),
  };
}

/** The min/max damage (+ counter) forecast for an attack, no luck drawn. */
export function previewCombat(
  view: MatchView,
  attackerUnitId: string,
  targetUnitId: string,
  gameData: GameData,
): CombatPreview {
  return calculateCombatPreview(
    matchViewToState(view),
    {
      type: "attack",
      matchId: view.matchId,
      playerId: view.viewerPlayerId,
      unitId: attackerUnitId,
      targetUnitId,
      expectedStateVersion: view.stateVersion,
      idempotencyKey: "preview",
    },
    gameData,
  );
}
