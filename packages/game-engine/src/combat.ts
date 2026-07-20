/**
 * Combat resolution: weapon selection, the authoritative `attack` transaction
 * (direct/indirect, counterattack, destruction) and the non-authoritative
 * `calculateCombatPreview` (`game-specification.md` §12; `rules.yaml` →
 * `combat_rules`).
 *
 * Combat is the engine's only consumer of injected randomness: attacker luck is
 * drawn from the `combat_luck` stream and counter luck from `combat_counter_luck`
 * (§12.6, `randomness.combat`), each roll is persisted in its event so replay
 * never rerolls, and `match.randomSequenceIndex` advances by the committed draw
 * count. Base damage comes strictly from the `damage-chart.yaml` matrix — a
 * missing cell means the matchup is illegal (§12.3) — and the pure formula lives
 * in `damage.ts`. Attack/defense values default to 100 and are adjusted by the
 * declarative commander modifiers (§12.5, M3-T8) of the unit's owner — including
 * the terrain-scoped ones, resolved on the tile the unit stands on (ADR-0006).
 *
 * @see docs/02-data/rules.yaml → combat_rules, randomness
 * @see docs/01-specification/game-specification.md §12
 * @see docs/04-development/milestones/m3-combat-systems-fog.md (M3-T1)
 */

import type { GameData } from "game-data";

import type { AttackAction } from "./actions";
import {
  displayHp,
  removeUnit,
  replaceProperty,
  replaceUnit,
  unitById,
  updateMatch,
} from "./board";
import { clearCaptureBy } from "./capture";
import { ownerModifier } from "./commanders";
import { computeDamage } from "./damage";
import type {
  CombatPreview,
  EngineResult,
  ValidationError,
  ValidationResult,
} from "./engine";
import type { CargoDestroyedEvent, Event, UnitDestroyedEvent } from "./events";
import { validateMovementPath } from "./movement";
import type { RandomSource } from "./random";
import type { Coordinate, Id, MatchState, UnitState } from "./state";

type UnitDef = GameData["units"][string];
type Matchup = NonNullable<
  GameData["damageChart"]["attackers"][string]
>["matchups"][string];

/** Default attack/defense values before commander modifiers (§12.5). */
const BASE_VALUE = 100;

/** Orthogonal (Manhattan) distance between two tiles — the combat-range metric. */
function distance(a: Coordinate, b: Coordinate): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** The matchup row for `attacker` → `defender`, or undefined when illegal. */
function matchupFor(
  gameData: GameData,
  attackerTypeId: string,
  defenderTypeId: string,
): Matchup | undefined {
  return gameData.damageChart?.attackers[attackerTypeId]?.matchups[
    defenderTypeId
  ];
}

/** A selected weapon: which slot, its chart cell and the resolved weapon id. */
interface SelectedWeapon {
  readonly slot: "primary" | "secondary";
  readonly weaponId: Id;
  readonly baseDamage: number;
}

/**
 * The weapon combat auto-selects for a matchup: the highest-base-damage legal
 * weapon that is currently available, tie-broken to primary, with a zero-ammo
 * primary excluded (`combat_rules.weapon_selection`, §12.2). `null` when no
 * weapon can damage the target.
 */
function selectWeapon(
  matchup: Matchup | undefined,
  attackerAmmo: number,
): SelectedWeapon | null {
  if (matchup === undefined) return null;
  const primary = matchup.weapon_values.primary ?? null;
  const secondary = matchup.weapon_values.secondary ?? null;

  const candidates: SelectedWeapon[] = [];
  if (primary != null && attackerAmmo > 0) {
    candidates.push({
      slot: "primary",
      weaponId: primary.weapon_id,
      baseDamage: primary.base_damage,
    });
  }
  if (secondary != null) {
    candidates.push({
      slot: "secondary",
      weaponId: secondary.weapon_id,
      baseDamage: secondary.base_damage,
    });
  }
  if (candidates.length === 0) return null;
  candidates.sort(
    (a, b) => b.baseDamage - a.baseDamage || (a.slot === "primary" ? -1 : 1),
  );
  return candidates[0]!;
}

/**
 * The terrain a tile-scoped commander modifier resolves on for `unit`, or
 * undefined when none applies.
 *
 * **Aircraft are never on their tile**: §12.4 already gives them no terrain
 * defense stars because terrain does not shelter something flying over it, and
 * the same reasoning applies to every terrain-scoped modifier — otherwise a
 * passive's terrain penalty would bite an air force its terrain bonus can never
 * reach (ADR-0006).
 */
function terrainIdAt(
  gameData: GameData,
  mapId: Id,
  unit: UnitState,
  def: UnitDef | undefined,
): string | undefined {
  if (unit.position === null || def?.category === "air") return undefined;
  return gameData.maps[mapId]?.logical_terrain[unit.position.y]?.[
    unit.position.x
  ];
}

/**
 * Defender terrain stars — the `terrain.yaml` value, or 0 for air units (§12.4),
 * plus the defending commander's `terrain_defense_stars` modifier for that tile
 * (ADR-0006).
 */
function terrainStarsFor(
  state: MatchState,
  gameData: GameData,
  mapId: Id,
  unit: UnitState,
  def: UnitDef,
): number {
  if (def.category === "air" || unit.position === null) return 0;
  const terrainId = terrainIdAt(gameData, mapId, unit, def);
  const terrain =
    terrainId === undefined ? undefined : gameData.terrain[terrainId];
  const base = terrain?.defense_stars ?? 0;
  return (
    base +
    ownerModifier(
      state,
      unit.ownerPlayerId,
      gameData,
      "terrain_defense_stars",
      unit.typeId,
      terrainId,
    )
  );
}

/** True-HP damage `attacker` deals to `defender` with `weapon` and the given luck. */
function hitDamage(
  state: MatchState,
  gameData: GameData,
  mapId: Id,
  attacker: UnitState,
  defender: UnitState,
  defenderDef: UnitDef,
  weapon: SelectedWeapon,
  goodLuck: number,
  badLuck: number,
): number {
  return computeDamage({
    baseDamage: weapon.baseDamage,
    // Commander passive modifiers (M3-T8; data from ADR-0006). A terrain-scoped
    // modifier resolves on the tile of the unit it applies to: the attacker's
    // for `attack`, the defender's for `defense`.
    attackValue:
      BASE_VALUE +
      ownerModifier(
        state,
        attacker.ownerPlayerId,
        gameData,
        "attack",
        attacker.typeId,
        terrainIdAt(gameData, mapId, attacker, gameData.units[attacker.typeId]),
      ),
    defenseValue:
      BASE_VALUE +
      ownerModifier(
        state,
        defender.ownerPlayerId,
        gameData,
        "defense",
        defender.typeId,
        terrainIdAt(gameData, mapId, defender, defenderDef),
      ),
    goodLuck,
    badLuck,
    attackerDisplayHp: displayHp(attacker.trueHp),
    defenderDisplayHp: displayHp(defender.trueHp),
    terrainStars: terrainStarsFor(
      state,
      gameData,
      mapId,
      defender,
      defenderDef,
    ),
    defenderTrueHp: defender.trueHp,
  });
}

/** Ammo remaining after firing `weapon` — a primary spends ammo, a secondary does not. */
function ammoAfter(
  unit: UnitState,
  def: UnitDef,
  weapon: SelectedWeapon,
): number {
  if (weapon.slot !== "primary") return unit.ammo;
  return unit.ammo - def.logistics.primary_ammo_per_attack;
}

/**
 * Remove `unitId`, cascading to its cargo (§16.4) and cancelling any capture it
 * was performing (§12.9, §13.4). Shared by combat, and reused by capture/
 * transport/victory as they land. Returns the new state and the events emitted.
 */
export function destroyUnit(
  state: MatchState,
  unitId: Id,
  reason: UnitDestroyedEvent["reason"],
  gameData: GameData,
): { readonly state: MatchState; readonly events: Event[] } {
  const unit = unitById(state, unitId);
  if (unit === undefined) return { state, events: [] };

  const events: Event[] = [{ type: "unit_destroyed", unitId, reason }];
  let next = removeUnit(state, unitId);

  for (const cargoId of unit.cargoUnitIds) {
    if (unitById(next, cargoId) === undefined) continue;
    next = removeUnit(next, cargoId);
    const cargoEvent: CargoDestroyedEvent = {
      type: "cargo_destroyed",
      unitId: cargoId,
      transportUnitId: unitId,
    };
    events.push(cargoEvent);
  }

  // Cancel a capture this unit was performing — reset the property (§13.4).
  for (const property of next.properties) {
    if (property.capturingUnitId !== unitId) continue;
    const max = gameData.properties[property.typeId]?.max_capture_points ?? 20;
    next = replaceProperty(next, {
      ...property,
      capturingUnitId: null,
      capturePointsRemaining: max,
    });
  }

  return { state: next, events };
}

/** The tile a direct/indirect attacker fires from — the path end, or its own tile. */
function attackTile(
  attacker: UnitState,
  path: AttackAction["path"],
): Coordinate {
  if (path !== undefined && path.length > 0) return path[path.length - 1]!;
  if (attacker.position !== null) return attacker.position;
  return { x: -1, y: -1 }; // unreachable: cargo cannot attack (validated)
}

/** Whether `distance` falls in a unit's combat range (`units.yaml` combat). */
function inRange(def: UnitDef, dist: number): boolean {
  const min = def.combat.min_range ?? 1;
  const max = def.combat.max_range ?? 1;
  return dist >= min && dist <= max;
}

/** Validate an `attack` (turn/ownership, optional move, range, weapon; §12). */
export function validateAttack(
  state: MatchState,
  action: AttackAction,
  gameData: GameData,
): ValidationResult {
  const errors: ValidationError[] = [];
  const done = (): ValidationResult =>
    errors.length === 0 ? { valid: true } : { valid: false, errors };

  if (state.match.status !== "active")
    errors.push({ code: "match_not_active" });
  if (action.playerId !== state.match.activePlayerId) {
    errors.push({ code: "not_active_player" });
  }

  const attacker = unitById(state, action.unitId);
  if (attacker === undefined || attacker.position === null) {
    errors.push({ code: "invalid_unit" });
    return done();
  }
  if (attacker.ownerPlayerId !== action.playerId) {
    errors.push({ code: "unit_not_owned" });
  }
  if (attacker.hasActed) errors.push({ code: "unit_already_acted" });

  const atkDef = gameData.units[attacker.typeId];
  if (atkDef === undefined) {
    errors.push({ code: "invalid_unit" });
    return done();
  }

  // Optional move component (direct attackers only).
  const path = action.path;
  const moving = path !== undefined && path.length > 1;
  if (moving) {
    if (!atkDef.movement.can_move_and_attack) {
      errors.push({ code: "cannot_move_and_attack" });
    }
    const move = validateMovementPath(state, action.unitId, path, gameData);
    if (!move.valid) errors.push(...move.errors);
  }
  const from = attackTile(attacker, path);

  const defender = unitById(state, action.targetUnitId);
  if (
    defender === undefined ||
    defender.position === null ||
    defender.ownerPlayerId === attacker.ownerPlayerId
  ) {
    errors.push({ code: "invalid_target" });
    return done();
  }

  if (!inRange(atkDef, distance(from, defender.position))) {
    errors.push({ code: "out_of_range" });
  }

  const weapon = selectWeapon(
    matchupFor(gameData, attacker.typeId, defender.typeId),
    attacker.ammo,
  );
  if (weapon === null) errors.push({ code: "no_valid_weapon" });

  return done();
}

/**
 * Whether `attacker`, firing from tile `from`, could legally hit `defender` —
 * the range + weapon core of `validateAttack`, minus the move-path legality the
 * caller establishes separately (`from` is an origin or a proven-reachable tile).
 * Pure and side-effect free; used to enumerate `attack` legal actions (§11, §12).
 */
export function canAttackFrom(
  gameData: GameData,
  attacker: UnitState,
  attackerDef: UnitDef,
  from: Coordinate,
  defender: UnitState,
): boolean {
  if (defender.position === null) return false;
  if (defender.ownerPlayerId === attacker.ownerPlayerId) return false;
  if (attackerDef.combat === undefined) return false;
  if (!inRange(attackerDef, distance(from, defender.position))) return false;
  return (
    selectWeapon(
      matchupFor(gameData, attacker.typeId, defender.typeId),
      attacker.ammo,
    ) !== null
  );
}

/** The outcome of one directed hit, ready to be threaded into state and events. */
interface Strike {
  readonly weapon: SelectedWeapon;
  readonly damage: number;
  readonly defenderHpAfter: number;
  readonly goodLuck: number;
  readonly badLuck: number;
}

/** Resolve a single hit `attacker` → `defender`, drawing luck from `stream`. */
function resolveStrike(
  state: MatchState,
  gameData: GameData,
  mapId: Id,
  attacker: UnitState,
  defender: UnitState,
  defenderDef: UnitDef,
  weapon: SelectedWeapon,
  random: RandomSource,
  stream: "combat_luck" | "combat_counter_luck",
): Strike {
  const goodLuck = random.nextInt(stream, 0, 9);
  const badLuck = 0; // default bad-luck range is [0, 0] — no draw needed (§12.5)
  const damage = hitDamage(
    state,
    gameData,
    mapId,
    attacker,
    defender,
    defenderDef,
    weapon,
    goodLuck,
    badLuck,
  );
  return {
    weapon,
    damage,
    defenderHpAfter: defender.trueHp - damage,
    goodLuck,
    badLuck,
  };
}

/**
 * Apply a validated `attack`: optional move, the attacker's hit, destruction or a
 * counterattack from a surviving direct defender, ammo spend, and `has_acted`.
 * Draws 1 luck roll per hit and advances `randomSequenceIndex` accordingly.
 */
export function applyAttack(
  state: MatchState,
  action: AttackAction,
  gameData: GameData,
  random: RandomSource,
): EngineResult {
  const mapId = state.match.mapId;
  const attacker0 = unitById(state, action.unitId)!;
  const atkDef = gameData.units[attacker0.typeId]!;
  const defender0 = unitById(state, action.targetUnitId)!;
  const defDef = gameData.units[defender0.typeId]!;

  const events: Event[] = [];
  let draws = 0;

  // Move component (direct attackers).
  const path = action.path;
  const moving = path !== undefined && path.length > 1;
  const from = attackTile(attacker0, path);
  const fuelSpent = moving ? path.length - 1 : 0;
  if (moving) {
    events.push({
      type: "unit_moved",
      unitId: attacker0.id,
      path,
      fuelSpent,
      fuelAfter: attacker0.fuel - fuelSpent,
    });
  }

  // Attacker's hit.
  const weaponA = selectWeapon(
    matchupFor(gameData, attacker0.typeId, defender0.typeId),
    attacker0.ammo,
  )!;
  const hit = resolveStrike(
    state,
    gameData,
    mapId,
    { ...attacker0, position: from },
    defender0,
    defDef,
    weaponA,
    random,
    "combat_luck",
  );
  draws += 1;
  events.push({
    type: "unit_attacked",
    attackerUnitId: attacker0.id,
    defenderUnitId: defender0.id,
    weaponId: hit.weapon.weaponId,
    luck: { goodLuck: hit.goodLuck, badLuck: hit.badLuck },
    damage: hit.damage,
    defenderHpAfter: Math.max(0, hit.defenderHpAfter),
  });

  // The attacker's committed post-hit state (moved, ammo spent, activation ended).
  const attackerActed: UnitState = {
    ...attacker0,
    position: from,
    fuel: attacker0.fuel - fuelSpent,
    ammo: ammoAfter(attacker0, atkDef, weaponA),
    hasActed: true,
  };

  let next = state;

  if (hit.defenderHpAfter <= 0) {
    // Defender destroyed — no counterattack (§12.8).
    next = replaceUnit(next, attackerActed);
    const destroyed = destroyUnit(next, defender0.id, "combat", gameData);
    next = destroyed.state;
    events.push(...destroyed.events);
  } else {
    const defenderHit: UnitState = {
      ...defender0,
      trueHp: hit.defenderHpAfter,
    };

    // Counterattack: only a surviving, in-range direct defender with a valid
    // weapon strikes back at a direct attack (§12.8).
    const counterWeapon =
      atkDef.combat.type === "direct" &&
      defDef.combat.type === "direct" &&
      inRange(defDef, distance(defenderHit.position!, from))
        ? selectWeapon(
            matchupFor(gameData, defender0.typeId, attacker0.typeId),
            defender0.ammo,
          )
        : null;

    if (counterWeapon !== null) {
      const counter = resolveStrike(
        state,
        gameData,
        mapId,
        defenderHit,
        attackerActed,
        atkDef,
        counterWeapon,
        random,
        "combat_counter_luck",
      );
      draws += 1;
      events.push({
        type: "unit_counterattacked",
        attackerUnitId: defender0.id,
        defenderUnitId: attacker0.id,
        weaponId: counter.weapon.weaponId,
        luck: { goodLuck: counter.goodLuck, badLuck: counter.badLuck },
        damage: counter.damage,
        defenderHpAfter: Math.max(0, counter.defenderHpAfter),
      });

      const defenderFinal: UnitState = {
        ...defenderHit,
        ammo: ammoAfter(defender0, defDef, counterWeapon),
      };
      next = replaceUnit(next, defenderFinal);

      if (counter.defenderHpAfter <= 0) {
        const destroyed = destroyUnit(next, attacker0.id, "combat", gameData);
        next = destroyed.state;
        events.push(...destroyed.events);
      } else {
        next = replaceUnit(next, {
          ...attackerActed,
          trueHp: counter.defenderHpAfter,
        });
      }
    } else {
      next = replaceUnit(next, attackerActed);
      next = replaceUnit(next, defenderHit);
    }
  }

  // Attacking interrupts any capture the (surviving) attacker was performing.
  next = clearCaptureBy(next, attacker0.id, gameData);

  next = updateMatch(next, {
    randomSequenceIndex: state.match.randomSequenceIndex + draws,
  });

  return { nextState: next, events };
}

/**
 * A non-authoritative damage forecast for a visible attack (§12.7): the min/max
 * attacker damage (luck 0 and 9) and, when a counterattack is structurally
 * possible, its min/max range. Reveals no hidden information; draws no luck.
 */
export function calculateCombatPreview(
  state: MatchState,
  action: AttackAction,
  gameData: GameData,
): CombatPreview {
  const mapId = state.match.mapId;
  const attacker = unitById(state, action.unitId);
  const defender = unitById(state, action.targetUnitId);
  const base: CombatPreview = {
    attackerUnitId: action.unitId,
    defenderUnitId: action.targetUnitId,
    minDamage: 0,
    maxDamage: 0,
  };
  if (
    attacker === undefined ||
    defender === undefined ||
    defender.position === null
  ) {
    return base;
  }
  const atkDef = gameData.units[attacker.typeId];
  const defDef = gameData.units[defender.typeId];
  if (atkDef === undefined || defDef === undefined) return base;

  const from = attackTile(attacker, action.path);
  const weapon = selectWeapon(
    matchupFor(gameData, attacker.typeId, defender.typeId),
    attacker.ammo,
  );
  if (weapon === null) return base;

  const atkAt: UnitState = { ...attacker, position: from };
  const minDamage = hitDamage(
    state,
    gameData,
    mapId,
    atkAt,
    defender,
    defDef,
    weapon,
    0,
    0,
  );
  const maxDamage = hitDamage(
    state,
    gameData,
    mapId,
    atkAt,
    defender,
    defDef,
    weapon,
    9,
    0,
  );

  // Counter range, when a direct defender can strike back and survives (§12.8).
  const counterWeapon =
    atkDef.combat.type === "direct" &&
    defDef.combat.type === "direct" &&
    inRange(defDef, distance(defender.position, from))
      ? selectWeapon(
          matchupFor(gameData, defender.typeId, attacker.typeId),
          defender.ammo,
        )
      : null;

  if (counterWeapon === null) return { ...base, minDamage, maxDamage };

  // Healthiest survival (min attacker damage) → strongest counter; weakest
  // survival (max attacker damage) → weakest, or none if the defender can die.
  const strongest: UnitState = {
    ...defender,
    trueHp: Math.max(1, defender.trueHp - minDamage),
  };
  const counterMax = hitDamage(
    state,
    gameData,
    mapId,
    strongest,
    atkAt,
    atkDef,
    counterWeapon,
    9,
    0,
  );
  const survivesWorst = defender.trueHp - maxDamage > 0;
  const weakest: UnitState = {
    ...defender,
    trueHp: Math.max(1, defender.trueHp - maxDamage),
  };
  const counterMin = survivesWorst
    ? hitDamage(
        state,
        gameData,
        mapId,
        weakest,
        atkAt,
        atkDef,
        counterWeapon,
        0,
        0,
      )
    : 0;

  return {
    ...base,
    minDamage,
    maxDamage,
    counter: { minDamage: counterMin, maxDamage: counterMax },
  };
}
