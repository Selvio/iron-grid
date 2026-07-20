/**
 * Cross-file integrity validation (M1-T5).
 *
 * Runs after every per-file schema passes and enforces the `game-specification.md`
 * §31.1 checks and each file's `cross_file_contracts:` that span more than one
 * file: reference resolution (unit↔weapon, movement→terrain, production/repair→
 * property, property→terrain), complete damage coverage, and per-map reference
 * resolution. A single `GameDataError` aggregates every failure so a data author
 * sees the whole picture (`m1-game-data.md` M1-T5).
 *
 * @see docs/01-specification/game-specification.md §31.1
 * @see docs/04-development/milestones/m1-game-data.md (M1-T5)
 */

import { GameDataError, type GameDataIssue } from "../errors";
import type { Units } from "../schemas/units";
import type { Weapons } from "../schemas/weapons";
import type { DamageChart } from "../schemas/damage-chart";
import type { Terrains } from "../schemas/terrain";
import type { Properties } from "../schemas/properties";
import type { GameMaps, GameMap } from "../schemas/maps";
import type { Commanders } from "../schemas/commanders";

/** The parsed inputs the integrity layer cross-checks. */
export interface IntegrityInput {
  readonly units: Units;
  readonly weapons: Weapons;
  readonly damageChart: DamageChart;
  readonly terrain: Terrains;
  readonly properties: Properties;
  readonly maps: GameMaps;
  readonly commanders: Commanders;
}

/** The destructible terrain object that is a damage-chart defender but not a unit. */
const NON_UNIT_DEFENDER = "pipe_seam";

/** Whether two id lists hold the same set of values. */
function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((v) => set.has(v));
}

/** Cross-check a single map's terrain/property/unit references against the data set. */
function validateMapReferences(
  add: (cond: boolean, path: string, reason: string) => void,
  key: string,
  map: GameMap,
  data: IntegrityInput,
): void {
  const at = (sub: string): string => `official_maps.${key}.${sub}`;

  // Every placed terrain resolves and is allowed on official maps.
  for (const [y, row] of map.logical_terrain.entries()) {
    for (const [x, cell] of row.entries()) {
      const terrain = data.terrain[cell];
      add(
        terrain !== undefined,
        at(`logical_terrain[${y}][${x}]`),
        `terrain "${cell}" does not resolve`,
      );
      if (terrain !== undefined) {
        add(
          terrain.official_map_allowed,
          at(`logical_terrain[${y}][${x}]`),
          `terrain "${cell}" is not allowed on official maps`,
        );
      }
    }
  }

  const cellAt = (x: number, y: number): string | undefined =>
    map.logical_terrain[y]?.[x];

  // Every property resolves and sits on its property's terrain.
  for (const p of map.properties) {
    const def = data.properties[p.type_id];
    add(
      def !== undefined,
      at(`properties.${p.id}.type_id`),
      `property type "${p.type_id}" does not resolve`,
    );
    if (def !== undefined) {
      add(
        cellAt(p.x, p.y) === def.terrain_id,
        at(`properties.${p.id}`),
        `must sit on "${def.terrain_id}" terrain at (${p.x}, ${p.y})`,
      );
    }
  }

  // Every starting unit is enabled and can occupy its terrain.
  for (const u of map.starting_units) {
    const def = data.units[u.type_id];
    add(
      def !== undefined && def.enabled_in_mvp,
      at(`starting_units.${u.id}.type_id`),
      `unit "${u.type_id}" is not an enabled unit`,
    );
    const cell = cellAt(u.x, u.y);
    const terrain = cell !== undefined ? data.terrain[cell] : undefined;
    if (def !== undefined && terrain !== undefined) {
      add(
        terrain.movement_costs[def.movement.type] !== null,
        at(`starting_units.${u.id}`),
        `unit "${u.type_id}" cannot occupy "${cell}" at (${u.x}, ${u.y})`,
      );
    }
  }
}

/**
 * Cross-validate the parsed data set, throwing on any unresolved reference or
 * coverage gap.
 *
 * @throws {GameDataError} aggregating every cross-file failure
 */
export function validateIntegrity(data: IntegrityInput): void {
  const { units, weapons, damageChart, terrain, properties, maps } = data;
  const issues: GameDataIssue[] = [];
  const add = (
    cond: boolean,
    file: string,
    path: string,
    reason: string,
  ): void => {
    if (!cond) issues.push({ file, path, reason });
  };

  const enabled = Object.values(units).filter((u) => u.enabled_in_mvp);
  const enabledIds = new Set(enabled.map((u) => u.id));
  // Movement-cost keys are identical across terrains; sample one to resolve types against.
  const movementKeys = new Set(
    Object.keys(terrain.plain?.movement_costs ?? {}),
  );

  // Unit → weapon references resolve.
  for (const u of enabled) {
    for (const wid of [
      u.combat.primary_weapon_id,
      u.combat.secondary_weapon_id,
    ]) {
      if (wid !== null) {
        add(
          weapons[wid] !== undefined,
          "units.yaml",
          `units.${u.id}.combat`,
          `weapon "${wid}" does not resolve in weapons.yaml`,
        );
      }
    }
    add(
      movementKeys.has(u.movement.type),
      "units.yaml",
      `units.${u.id}.movement.type`,
      `movement type "${u.movement.type}" is not understood by terrain.yaml`,
    );
  }

  // Weapon → enabled-unit references resolve.
  for (const [wid, w] of Object.entries(weapons)) {
    for (const uid of w.used_by) {
      add(
        enabledIds.has(uid),
        "weapons.yaml",
        `weapons.${wid}.used_by`,
        `"${uid}" is not an enabled unit`,
      );
    }
  }

  // Production: each producer property lists exactly the enabled units of its
  // category, and each unit is produced at the property matching its category.
  const producerOfCategory = new Map<string, string>();
  for (const [pid, p] of Object.entries(properties)) {
    if (p.production.category !== "none")
      producerOfCategory.set(p.production.category, pid);
  }
  for (const [category, pid] of producerOfCategory) {
    const expected = enabled
      .filter((u) => u.category === category)
      .map((u) => u.id);
    add(
      sameSet(properties[pid]!.production.allowed_unit_ids, expected),
      "properties.yaml",
      `properties.${pid}.production.allowed_unit_ids`,
      `must be exactly the enabled ${category} units`,
    );
  }
  for (const u of enabled) {
    const producer = producerOfCategory.get(u.category);
    add(
      u.production.property === producer,
      "units.yaml",
      `units.${u.id}.production.property`,
      `${u.category} units must be produced at "${producer}"`,
    );
  }

  // Repair: each property a unit repairs at exists and repairs the unit's category.
  for (const u of enabled) {
    for (const pid of u.repair.properties) {
      const p = properties[pid];
      add(
        p !== undefined,
        "units.yaml",
        `units.${u.id}.repair.properties`,
        `property "${pid}" does not resolve`,
      );
      if (p !== undefined) {
        add(
          p.repair.categories.includes(u.category),
          "units.yaml",
          `units.${u.id}.repair.properties`,
          `"${pid}" does not repair ${u.category} units`,
        );
      }
    }
  }

  // Property → terrain references resolve.
  for (const [pid, p] of Object.entries(properties)) {
    add(
      terrain[p.terrain_id] !== undefined,
      "properties.yaml",
      `properties.${pid}.terrain_id`,
      `terrain "${p.terrain_id}" does not resolve`,
    );
  }

  // Damage-chart coverage: exactly the armed enabled units attack; exactly the
  // enabled units plus Pipe Seam defend. Every referenced weapon resolves.
  const armed = enabled
    .filter((u) => u.combat.type !== "none")
    .map((u) => u.id);
  add(
    sameSet(damageChart.attacker_order, armed),
    "damage-chart.yaml",
    "attacker_order",
    "must be exactly the enabled armed units",
  );
  add(
    sameSet(damageChart.defender_order, [...enabledIds, NON_UNIT_DEFENDER]),
    "damage-chart.yaml",
    "defender_order",
    "must be exactly the enabled units plus pipe_seam",
  );
  for (const [aid, a] of Object.entries(damageChart.attackers)) {
    for (const slot of ["primary", "secondary"] as const) {
      const wid = a.weapons[slot];
      if (wid !== undefined)
        add(
          weapons[wid] !== undefined,
          "damage-chart.yaml",
          `attackers.${aid}.weapons.${slot}`,
          `weapon "${wid}" does not resolve`,
        );
    }
    for (const [did, m] of Object.entries(a.matchups)) {
      for (const slot of ["primary", "secondary"] as const) {
        const cell = m.weapon_values[slot];
        if (cell != null)
          add(
            weapons[cell.weapon_id] !== undefined,
            "damage-chart.yaml",
            `attackers.${aid}.matchups.${did}.weapon_values.${slot}`,
            `weapon "${cell.weapon_id}" does not resolve`,
          );
      }
    }
  }

  // Commander modifier scopes resolve (ADR-0006). Every scoped id must name a
  // real unit / terrain / property, so a passive can never silently stop
  // covering something a later data change renamed.
  const movementTypes = new Set<string>(
    Object.values(units).map((u) => u.movement.type),
  );
  const unitCategories = new Set<string>(
    Object.values(units).map((u) => u.category),
  );
  for (const [key, cmd] of Object.entries(data.commanders.commanders)) {
    for (const m of cmd.passive.modifiers) {
      const at = `commanders.${key}.passive.modifiers.${m.id}.scope`;
      const resolves = (value: string): boolean => {
        switch (m.scope.type) {
          case "unit_ids":
            return units[value] !== undefined;
          case "unit_categories":
            return unitCategories.has(value);
          case "movement_types":
            return movementTypes.has(value);
          case "terrain_ids":
            return terrain[value] !== undefined;
          case "property_ids":
            return properties[value] !== undefined;
          default:
            return true;
        }
      };
      add(
        m.scope.type === "all_units" || m.scope.values.length > 0,
        "commanders.yaml",
        at,
        `scope "${m.scope.type}" needs at least one value`,
      );
      for (const value of m.scope.values) {
        add(
          resolves(value),
          "commanders.yaml",
          at,
          `${m.scope.type} value "${value}" does not resolve`,
        );
      }
    }
  }

  // Per-map reference resolution (empty official set today; ready for M10).
  for (const [key, map] of Object.entries(maps)) {
    validateMapReferences(
      (cond, path, reason) => add(cond, "maps.yaml", path, reason),
      key,
      map,
      data,
    );
  }

  if (issues.length > 0) throw new GameDataError(issues);
}
