import {
  calculateCombatPreview,
  calculateLegalActions,
  terrainMovementCost,
  type AttackOption,
  type CombatPreview,
  type Coordinate,
} from "game-engine";
import type { GameData } from "game-data";

import type { FactionId } from "@/app/components/faction-badge";
import type { MatchView } from "@/app/lib/api-client";
import {
  factionSheetPath,
  unitFrame,
  unitSpriteRow,
  type UnitRendering,
} from "@/app/lib/render/derive-render-data";

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
  /** Tiles the unit may supply adjacent allies from (APC). */
  readonly supplyDestinations: readonly Coordinate[];
  /** Friendly same-type tiles the unit may merge into. */
  readonly joinDestinations: readonly Coordinate[];
  /** Friendly transport tiles the unit may load into. */
  readonly loadDestinations: readonly Coordinate[];
  /** Tiles a loaded transport may unload cargo from. */
  readonly unloadDestinations: readonly Coordinate[];
  /** Tiles a surfaced submarine may dive from. */
  readonly diveDestinations: readonly Coordinate[];
  /** Tiles a submerged submarine may surface from. */
  readonly surfaceDestinations: readonly Coordinate[];
}

/** The actions available to a unit from one chosen destination tile. */
export interface DestinationOptions {
  /** `move_and_wait` (or an attack-in-place move) may end here. */
  readonly canWait: boolean;
  /** A `capture` may be performed here. */
  readonly canCapture: boolean;
  /** The enemy unit ids attackable when firing from this tile. */
  readonly attackTargets: readonly string[];
  readonly canSupply: boolean;
  readonly canJoin: boolean;
  readonly canLoad: boolean;
  readonly canUnload: boolean;
  readonly canDive: boolean;
  readonly canSurface: boolean;
}

/** A DOM sprite crop — the viewer-faction idle frame of a unit (CSS sprite). */
export interface UnitSprite {
  /** The faction sprite-sheet URL to crop from. */
  readonly sheetUrl: string;
  /** The frame's top-left offset within the sheet, in source pixels. */
  readonly frameX: number;
  readonly frameY: number;
  /** The frame is a square of this many source pixels. */
  readonly frameSize: number;
}

/** One buildable unit in a property's build menu (§6.4). */
export interface ProductionOption {
  readonly unitTypeId: string;
  readonly displayName: string;
  readonly cost: number;
  /** False when the viewer's funds cannot cover `cost` (shown greyed). */
  readonly affordable: boolean;
  /** The unit's sprite for the menu icon, or null when art is unavailable. */
  readonly sprite: UnitSprite | null;
}

/** The viewer-faction idle sprite crop for `unitTypeId`, or null when unavailable. */
export function unitSprite(
  view: MatchView,
  gameData: GameData,
  unitTypeId: string,
): UnitSprite | null {
  const faction = view.you?.factionId;
  const rendering = gameData.units[unitTypeId]?.rendering as
    UnitRendering | undefined;
  if (faction === undefined || rendering === undefined) return null;
  const frame = unitFrame(unitSpriteRow(rendering), "idle", 0);
  return {
    sheetUrl: factionSheetPath(faction as FactionId),
    frameX: frame.x,
    frameY: frame.y,
    frameSize: frame.width,
  };
}

/** A projected property (the element type of `MatchView.properties`). */
type ViewProperty = MatchView["properties"][number];

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
  const dests = (type: string) => byType(type)?.destinations ?? [];
  return {
    moveDestinations: dests("move_and_wait"),
    captureDestinations: dests("capture"),
    attacks: byType("attack")?.attacks ?? [],
    supplyDestinations: dests("supply"),
    joinDestinations: dests("join"),
    loadDestinations: dests("load"),
    unloadDestinations: dests("unload"),
    diveDestinations: dests("dive"),
    surfaceDestinations: dests("surface"),
  };
}

/** Narrow a unit's menu to the actions legal from a single destination tile. */
export function actionsAtDestination(
  menu: UnitMenu,
  destination: Coordinate,
): DestinationOptions {
  const { x, y } = destination;
  const has = (tiles: readonly Coordinate[]) => tiles.some((c) => at(c, x, y));
  return {
    canWait: has(menu.moveDestinations),
    canCapture: has(menu.captureDestinations),
    attackTargets: menu.attacks
      .filter((a) => at(a.from, x, y))
      .map((a) => a.targetUnitId),
    canSupply: has(menu.supplyDestinations),
    canJoin: has(menu.joinDestinations),
    canLoad: has(menu.loadDestinations),
    canUnload: has(menu.unloadDestinations),
    canDive: has(menu.diveDestinations),
    canSurface: has(menu.surfaceDestinations),
  };
}

/**
 * The owned, empty production property at a tile (base/airport/port), or null.
 * The `isMyTurn` gate stays in the controller (like `ownSelectableAt`); this only
 * checks ownership, that the property type produces, and that the tile is empty.
 */
export function productionTargetAt(
  view: MatchView,
  gameData: GameData,
  x: number,
  y: number,
): ViewProperty | null {
  const property = view.properties.find((p) => at(p.position, x, y));
  if (
    property === undefined ||
    property.ownerPlayerId !== view.viewerPlayerId
  ) {
    return null;
  }
  const production = gameData.properties[property.typeId]?.production;
  if (production === undefined || production.category === "none") return null;
  const occupied = view.units.some(
    (u) => u.position !== null && at(u.position, x, y),
  );
  return occupied ? null : property;
}

/**
 * The property's full enabled build roster with cost + affordability — the
 * Advance-Wars build menu. Unaffordable units are still listed (`affordable:
 * false`) so the player sees the whole roster and its prices; the engine's
 * `produce` enumeration and the server both reject an unaffordable build.
 */
export function previewProduction(
  view: MatchView,
  gameData: GameData,
  property: ViewProperty,
): ProductionOption[] {
  const funds = view.you?.funds ?? 0;
  const allowed =
    gameData.properties[property.typeId]?.production.allowed_unit_ids ?? [];
  const options: ProductionOption[] = [];
  for (const unitTypeId of allowed) {
    const unitDef = gameData.units[unitTypeId];
    if (unitDef === undefined || !unitDef.enabled_in_mvp) continue;
    options.push({
      unitTypeId,
      displayName: unitDef.display_name ?? unitTypeId,
      cost: unitDef.cost,
      affordable: funds >= unitDef.cost,
      sprite: unitSprite(view, gameData, unitTypeId),
    });
  }
  return options;
}

/** One cargo unit a transport may unload (id + label + sprite for the picker). */
export interface UnloadCargo {
  readonly unitId: string;
  readonly displayName: string;
  readonly sprite: UnitSprite | null;
}

/** The cargo carried by `transportUnitId`, as unload-menu options. */
export function unloadCargo(
  view: MatchView,
  gameData: GameData,
  transportUnitId: string,
): UnloadCargo[] {
  const transport = view.units.find((u) => u.id === transportUnitId);
  if (transport === undefined) return [];
  return transport.cargoUnitIds.map((cargoId) => {
    const cargo = view.units.find((u) => u.id === cargoId);
    const typeId = cargo?.typeId ?? "";
    return {
      unitId: cargoId,
      displayName: gameData.units[typeId]?.display_name ?? typeId,
      sprite: unitSprite(view, gameData, typeId),
    };
  });
}

/**
 * The adjacent, empty, terrain-legal tiles `cargoUnitId` can be dropped on when
 * the transport unloads from `from` (§16.3) — mirrors `validateUnload`'s per-tile
 * check. The transport's own current tile counts as empty (it will vacate).
 */
export function unloadDropTiles(
  view: MatchView,
  gameData: GameData,
  transportUnitId: string,
  from: Coordinate,
  cargoUnitId: string,
): Coordinate[] {
  const cargo = view.units.find((u) => u.id === cargoUnitId);
  const movementType = cargo && gameData.units[cargo.typeId]?.movement?.type;
  if (movementType === undefined) return [];
  const neighbors: Coordinate[] = [
    { x: from.x + 1, y: from.y },
    { x: from.x - 1, y: from.y },
    { x: from.x, y: from.y + 1 },
    { x: from.x, y: from.y - 1 },
  ];
  return neighbors.filter((n) => {
    if (n.x < 0 || n.y < 0 || n.x >= view.map.width || n.y >= view.map.height) {
      return false;
    }
    if (terrainMovementCost(gameData, view.mapId, n, movementType) === null) {
      return false;
    }
    const occupant = view.units.find(
      (u) => u.position !== null && at(u.position, n.x, n.y),
    );
    return occupant === undefined || occupant.id === transportUnitId;
  });
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
