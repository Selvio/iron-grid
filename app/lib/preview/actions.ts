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
  unitSpriteKey,
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
  /** The frame's size in source pixels — the art pack's frames are not square. */
  readonly frameWidth: number;
  readonly frameHeight: number;
}

/** The Advance-Wars intel read-out for one unit type (build menu right panel). */
export interface UnitStats {
  /** Movement points. */
  readonly move: number;
  /** Base vision range. */
  readonly vision: number;
  /** Max fuel ("gas"). */
  readonly gas: number;
  /** Primary-weapon ammo, or null when the unit fires without ammo (∞). */
  readonly ammo: number | null;
  /** Primary / secondary weapon display names, or null for an empty slot. */
  readonly weapon1: string | null;
  readonly weapon2: string | null;
  /** Movement class label — "Foot", "Treads", "Air"… */
  readonly mobility: string;
  /** The pack's own word-label sprite for that class, or null when it has none. */
  readonly mobilityKey: string | null;
  /** Which domain badge lights up. */
  readonly domain: "ground" | "air" | "naval";
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
  /** Move/vision/gas/weapons for the intel panel. */
  readonly stats: UnitStats;
}

/** `units.yaml` movement types as the intel panel labels them. */
const MOBILITY_LABEL: Readonly<Record<string, string>> = {
  foot: "Foot",
  mech: "Mech",
  tires: "Tires",
  treads: "Treads",
  air: "Air",
  ship: "Ship",
  transport_ship: "Ship",
};

/** The same classes as the art pack's own HUD word labels (`things.png`). */
const MOBILITY_SPRITE: Readonly<Record<string, string>> = {
  foot: "hud_mobility_foot",
  mech: "hud_mobility_mech",
  tires: "hud_mobility_tires",
  treads: "hud_mobility_treads",
  ship: "hud_mobility_ship",
  transport_ship: "hud_mobility_transport",
};

/** The intel read-out for a unit type, defaulting anything the data omits. */
function unitStats(gameData: GameData, unitTypeId: string): UnitStats {
  const def = gameData.units[unitTypeId] as
    | {
        movement?: { points?: number; type?: string };
        vision?: { base_range?: number };
        logistics?: { max_fuel?: number; max_ammo?: number | null };
        combat?: {
          primary_weapon_id?: string | null;
          secondary_weapon_id?: string | null;
        };
        category?: string;
      }
    | undefined;
  const weaponName = (id: string | null | undefined): string | null =>
    id ? (gameData.weapons[id]?.display_name ?? id) : null;
  const movementType = def?.movement?.type ?? "";
  const category = def?.category;
  return {
    move: def?.movement?.points ?? 0,
    vision: def?.vision?.base_range ?? 0,
    gas: def?.logistics?.max_fuel ?? 0,
    ammo: def?.logistics?.max_ammo ?? null,
    weapon1: weaponName(def?.combat?.primary_weapon_id),
    weapon2: weaponName(def?.combat?.secondary_weapon_id),
    mobility: MOBILITY_LABEL[movementType] ?? movementType,
    mobilityKey: MOBILITY_SPRITE[movementType] ?? null,
    domain: category === "air" || category === "naval" ? category : "ground",
  };
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
  const spriteKey = unitSpriteKey(rendering);
  const frame = unitFrame(spriteKey, "idle", 0);
  return {
    sheetUrl: factionSheetPath(faction as FactionId, spriteKey),
    frameX: frame.x,
    frameY: frame.y,
    frameWidth: frame.width,
    frameHeight: frame.height,
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
 * The tiles a selected unit threatens, as the Advance-Wars red hatch.
 *
 * An indirect unit cannot move and fire (§12.4), so its range is a fixed ring
 * around the tile it stands on — that ring *is* its turn, which is why the board
 * shows it by default. A direct unit instead threatens everything one step off
 * its move range, which `menu` supplies; that view buries the board in hatch, so
 * the controller only asks for it when the player toggles the range on. Passing
 * `menu: null` therefore yields nothing for direct units. Unarmed units (APC,
 * transports) always return nothing.
 */
export function attackRangeTiles(
  view: MatchView,
  gameData: GameData,
  unitId: string,
  menu: UnitMenu | null = null,
): Coordinate[] {
  const unit = view.units.find((u) => u.id === unitId);
  if (unit === undefined || unit.position === null) return [];
  const def = gameData.units[unit.typeId] as
    | {
        combat?: { min_range?: number | null; max_range?: number | null };
        movement?: { can_move_and_attack?: boolean };
      }
    | undefined;
  const minRange = def?.combat?.min_range ?? null;
  const maxRange = def?.combat?.max_range ?? null;
  if (minRange === null || maxRange === null) return [];

  const movesAndFires = def?.movement?.can_move_and_attack !== false;
  if (movesAndFires && menu === null) return [];
  const firingTiles = movesAndFires ? menu!.moveDestinations : [unit.position];
  // Tiles it can move onto stay blue — the hatch is only what it can shoot.
  const moveable = new Set(
    movesAndFires ? firingTiles.map((c) => `${c.x},${c.y}`) : [],
  );
  const tiles = new Map<string, Coordinate>();
  for (const from of firingTiles) {
    for (let dy = -maxRange; dy <= maxRange; dy++) {
      const span = maxRange - Math.abs(dy);
      for (let dx = -span; dx <= span; dx++) {
        const distance = Math.abs(dx) + Math.abs(dy);
        if (distance < minRange) continue;
        const x = from.x + dx;
        const y = from.y + dy;
        if (x < 0 || y < 0 || x >= view.map.width || y >= view.map.height) {
          continue;
        }
        const key = `${x},${y}`;
        if (moveable.has(key)) continue;
        tiles.set(key, { x, y });
      }
    }
  }
  return [...tiles.values()];
}

/** True when the unit fires only from where it stands (its hatch shows by default). */
export function isIndirectUnit(
  view: MatchView,
  gameData: GameData,
  unitId: string,
): boolean {
  const unit = view.units.find((u) => u.id === unitId);
  if (unit === undefined) return false;
  const def = gameData.units[unit.typeId] as
    { movement?: { can_move_and_attack?: boolean } } | undefined;
  return def?.movement?.can_move_and_attack === false;
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
      stats: unitStats(gameData, unitTypeId),
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
