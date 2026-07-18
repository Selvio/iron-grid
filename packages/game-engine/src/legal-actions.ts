/**
 * `calculateLegalActions` — enumerate the actions the active player may take
 * (`game-specification.md` §11, §27.2, `rules.yaml` → `action_processing`).
 *
 * For each of the active player's not-yet-acted, board-present units it emits, in
 * order: a `move_and_wait` carrying its legal destinations — the reachable tiles
 * (M2-T3) plus the unit's own tile, since waiting in place is always legal (§11
 * `wait`); a `capture` when the unit can capture a property from a reachable
 * tile (§13); and an `attack` carrying the (firing-tile, target) pairs it can hit
 * (§12). Plus one `end_turn`. The enumeration asserts a legal path to each tile
 * exists (the tile is the origin or in the movement range); the caller builds the
 * exact path and the engine re-validates it on submit.
 *
 * A firing / capture tile is either the unit's origin (attack or capture in
 * place) or a movement-range tile — the latter only for units that may move and
 * fire / move and capture (`units.yaml` `can_move_and_attack` /
 * `can_move_and_capture`), mirroring `validateAttack` / `validateCapture`.
 *
 * Only the active player of an active match has actions; anyone else gets an
 * empty list. Units, destinations and attacks are emitted in canonical board
 * order so the enumeration is deterministic for replays and tests.
 *
 * @see docs/01-specification/game-specification.md §11, §12, §13, §27.2
 * @see docs/04-development/milestones/m2-engine-core.md (M2-T5)
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T6)
 */

import type { GameData } from "game-data";

import { compareBoardOrder } from "./board";
import { canAttackFrom } from "./combat";
import { canCaptureAt } from "./capture";
import type { AttackOption, LegalAction } from "./engine";
import { calculateMovementRange } from "./movement";
import type { Coordinate, Id, MatchState, UnitState } from "./state";

/** Order coordinates canonically (`y asc, x asc`) for deterministic output. */
function byBoardOrder(a: Coordinate, b: Coordinate): number {
  return a.y - b.y || a.x - b.x;
}

/** Order attack options by firing tile, then by target id, for determinism. */
function byAttackOrder(a: AttackOption, b: AttackOption): number {
  return (
    byBoardOrder(a.from, b.from) || a.targetUnitId.localeCompare(b.targetUnitId)
  );
}

/** The tiles a unit may end its activation on when firing/capturing: origin (in
 * place) plus, when the capability allows a move first, its reachable tiles. */
function actionTiles(
  origin: Coordinate,
  reachable: readonly Coordinate[],
  canMoveFirst: boolean,
): readonly Coordinate[] {
  return canMoveFirst ? [origin, ...reachable] : [origin];
}

/** The `capture` legal action for `unit`, or `null` when it can capture nothing. */
function captureAction(
  state: MatchState,
  gameData: GameData,
  unit: UnitState,
  def: GameData["units"][string],
  origin: Coordinate,
  reachable: readonly Coordinate[],
): LegalAction | null {
  const tiles = actionTiles(
    origin,
    reachable,
    def.movement.can_move_and_capture,
  );
  const destinations = tiles
    .filter((tile) => canCaptureAt(state, gameData, unit, def, tile))
    .sort(byBoardOrder);
  return destinations.length === 0
    ? null
    : { type: "capture", unitId: unit.id, destinations };
}

/** The `attack` legal action for `unit`, or `null` when it can hit nothing. */
function attackAction(
  state: MatchState,
  gameData: GameData,
  unit: UnitState,
  def: GameData["units"][string],
  origin: Coordinate,
  reachable: readonly Coordinate[],
): LegalAction | null {
  const enemies = state.units.filter(
    (u) => u.ownerPlayerId !== unit.ownerPlayerId && u.position !== null,
  );
  const tiles = actionTiles(
    origin,
    reachable,
    def.movement.can_move_and_attack,
  );
  const attacks: AttackOption[] = [];
  for (const from of tiles) {
    for (const enemy of enemies) {
      if (canAttackFrom(gameData, unit, def, from, enemy)) {
        attacks.push({ from, targetUnitId: enemy.id });
      }
    }
  }
  attacks.sort(byAttackOrder);
  return attacks.length === 0
    ? null
    : { type: "attack", unitId: unit.id, attacks };
}

/**
 * The legal actions available to `playerId` in the current state: per idle unit a
 * `move_and_wait` and, when available, a `capture` and an `attack`; plus one
 * `end_turn`.
 */
export function calculateLegalActions(
  state: MatchState,
  playerId: Id,
  gameData: GameData,
): readonly LegalAction[] {
  if (
    state.match.status !== "active" ||
    state.match.activePlayerId !== playerId
  ) {
    return [];
  }

  const actions: LegalAction[] = [];
  const idleUnits = state.units
    .filter(
      (u) => u.ownerPlayerId === playerId && u.position !== null && !u.hasActed,
    )
    .slice()
    .sort(compareBoardOrder);

  for (const unit of idleUnits) {
    const origin = unit.position;
    if (origin === null) continue; // narrowed already, but keep TS honest
    const { reachable } = calculateMovementRange(state, unit.id, gameData);
    // Waiting in place is a zero-length move_and_wait, so the origin is a
    // destination alongside every reachable tile.
    const destinations = [origin, ...reachable].sort(byBoardOrder);
    actions.push({ type: "move_and_wait", unitId: unit.id, destinations });

    const def = gameData.units[unit.typeId];
    if (def === undefined) continue; // unknown type: only move_and_wait is safe
    const capture = captureAction(
      state,
      gameData,
      unit,
      def,
      origin,
      reachable,
    );
    if (capture !== null) actions.push(capture);
    const attack = attackAction(state, gameData, unit, def, origin, reachable);
    if (attack !== null) actions.push(attack);
  }

  actions.push({ type: "end_turn" });
  return actions;
}
