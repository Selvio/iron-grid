/**
 * `units.yaml` schema and intra-file validation.
 *
 * Shape is validated with Zod (loose objects preserve descriptive fields the
 * engine does not yet consume); the cross-entry obligations from the file's
 * `required_validation_tests:` are checked in TypeScript. Cross-file references
 * (weapon IDs, damage-chart coverage, movement→terrain, repair/production→
 * property) are deferred to M1-T5.
 *
 * Note: "air units never receive terrain defense" is an engine combat invariant
 * (M2/M3), not a data field — air units do not carry a per-unit override — so it
 * is not validated here.
 *
 * @see docs/02-data/units.yaml
 * @see docs/04-development/milestones/m1-game-data.md (M1-T2)
 */

import { z } from "zod";

import {
  combatType,
  movementType,
  productionProperty,
  repairProperty,
  specialState,
  targetDomain,
  unitCategory,
} from "./enums";
import { IssueCollector, parseShape } from "./parse";

/** Daily-fuel burn: a single default, or per-state values for divers. */
const dailyFuel = z.union([
  z.object({ surfaced: z.int(), submerged: z.int() }),
  z.object({ default: z.int() }),
]);

// Rendering: a single atlas sprite family, or per-state families for divers.
// These use closed objects (not loose) so `"sprite_keys" in r` discriminates the
// union; descriptive extras (shadow, animation_profile) are re-modeled by the
// renderer. Keys name families in the generated sprite atlas — the art pack has
// no uniform grid, so no row/column geometry lives in the data.
const rendering = z.union([
  z.object({
    sprite_keys: z.object({ surfaced: z.string(), submerged: z.string() }),
  }),
  z.object({ sprite_key: z.string() }),
]);

/** One MVP unit (`units.yaml` units.*). */
const unitSchema = z.looseObject({
  id: z.string(),
  display_name: z.string(),
  category: unitCategory,
  enabled_in_mvp: z.boolean(),
  cost: z.int().min(0),
  max_true_hp: z.int(),
  movement: z.looseObject({
    points: z.int(),
    type: movementType,
    fuel_per_tile: z.int(),
    can_move_and_attack: z.boolean(),
    can_move_and_capture: z.boolean(),
    can_move_and_load: z.boolean(),
    can_move_and_join: z.boolean(),
  }),
  logistics: z.looseObject({
    max_fuel: z.int(),
    daily_fuel: dailyFuel,
    max_ammo: z.int().nullable(),
    primary_ammo_per_attack: z.int(),
  }),
  vision: z.looseObject({ base_range: z.int() }),
  combat: z.looseObject({
    type: combatType,
    min_range: z.int().nullable(),
    max_range: z.int().nullable(),
    primary_weapon_id: z.string().nullable(),
    secondary_weapon_id: z.string().nullable(),
    target_domains: z.array(targetDomain),
  }),
  capabilities: z.looseObject({
    can_capture: z.boolean(),
    can_supply: z.boolean(),
    can_transport: z.boolean(),
    can_dive: z.boolean(),
  }),
  transport: z.looseObject({
    capacity: z.int().min(0),
    allowed_cargo: z.array(z.string()),
  }),
  production: z.looseObject({ property: productionProperty }),
  repair: z.looseObject({
    properties: z.array(repairProperty),
    hp_per_turn: z.int(),
    cost_per_displayed_hp_percent: z.int(),
  }),
  special_states: z.array(specialState),
  rendering,
  validation: z.looseObject({}).optional(),
});

/** The top-level `units.yaml` document (only the sections M1-T2 reads). */
const unitsFile = z.looseObject({
  defaults: z.looseObject({
    produced_unit_has_acted: z.boolean(),
    starts_with_full_fuel: z.boolean(),
    starts_with_full_ammo: z.boolean(),
  }),
  units: z.record(z.string(), unitSchema),
  cross_unit_constraints: z.looseObject({
    roster: z.looseObject({ expected_enabled_unit_count: z.int() }),
    rendering: z.looseObject({ allowed_sprite_keys: z.array(z.string()) }),
  }),
});

/** A validated unit. */
export type Unit = z.infer<typeof unitSchema>;

/** The validated units, keyed by unit ID. */
export type Units = Readonly<Record<string, Unit>>;

/** Count of units that must be enabled for the MVP roster (`units.yaml`). */
const REQUIRED_ENABLED_UNITS = 19;

/** The atlas sprite families a unit binds to (one, or two for a diver). */
function spriteKeysOf(r: Unit["rendering"]): string[] {
  return "sprite_keys" in r
    ? [r.sprite_keys.surfaced, r.sprite_keys.submerged]
    : [r.sprite_key];
}

/** Assert a unit's declared `validation.expected_*` self-checks match its values. */
function checkExpectedValues(c: IssueCollector, key: string, u: Unit): void {
  const v = u.validation;
  if (v === undefined) return;
  const at = (field: string): string => `units.${key}.validation.${field}`;
  const eq = (field: string, expected: unknown, actual: unknown): void =>
    c.check(
      expected === actual,
      at(field),
      `${field} ${String(expected)} != actual ${String(actual)}`,
    );

  if ("expected_cost" in v) eq("expected_cost", v.expected_cost, u.cost);
  if ("expected_move" in v)
    eq("expected_move", v.expected_move, u.movement.points);
  if ("expected_vision" in v)
    eq("expected_vision", v.expected_vision, u.vision.base_range);
  if ("expected_fuel" in v)
    eq("expected_fuel", v.expected_fuel, u.logistics.max_fuel);
  if ("expected_ammo" in v)
    eq("expected_ammo", v.expected_ammo, u.logistics.max_ammo);
  if ("expected_transport_capacity" in v) {
    eq(
      "expected_transport_capacity",
      v.expected_transport_capacity,
      u.transport.capacity,
    );
  }
  if (Array.isArray(v.expected_range)) {
    c.check(
      v.expected_range[0] === u.combat.min_range &&
        v.expected_range[1] === u.combat.max_range,
      at("expected_range"),
      `expected_range ${JSON.stringify(v.expected_range)} != [${u.combat.min_range}, ${u.combat.max_range}]`,
    );
  }
  const df = u.logistics.daily_fuel;
  if (
    v.expected_daily_fuel &&
    typeof v.expected_daily_fuel === "object" &&
    "surfaced" in df
  ) {
    const exp = v.expected_daily_fuel as Record<string, unknown>;
    c.check(
      exp.surfaced === df.surfaced && exp.submerged === df.submerged,
      at("expected_daily_fuel"),
      "expected_daily_fuel does not match logistics.daily_fuel",
    );
  }
}

/**
 * Validate `units.yaml` and return its units keyed by ID.
 *
 * @throws {GameDataError} on any shape or intra-file semantic failure
 */
export function parseUnits(raw: unknown): Units {
  const file = parseShape("units.yaml", unitsFile, raw);
  const c = new IssueCollector("units.yaml");
  const units = file.units;
  const entries = Object.entries(units);

  // Roster cardinality and identity.
  for (const [key, u] of entries) {
    c.check(
      u.id === key,
      `units.${key}.id`,
      `id "${u.id}" does not match its key "${key}"`,
    );
  }
  const enabled = entries.filter(([, u]) => u.enabled_in_mvp);
  c.check(
    enabled.length === REQUIRED_ENABLED_UNITS,
    "units",
    `expected exactly ${REQUIRED_ENABLED_UNITS} enabled units, found ${enabled.length}`,
  );
  c.check(
    file.cross_unit_constraints.roster.expected_enabled_unit_count ===
      REQUIRED_ENABLED_UNITS,
    "cross_unit_constraints.roster.expected_enabled_unit_count",
    `roster expects ${file.cross_unit_constraints.roster.expected_enabled_unit_count}, not ${REQUIRED_ENABLED_UNITS}`,
  );

  // Produced units begin at full state and acted (defaults contract).
  const d = file.defaults;
  c.check(
    d.produced_unit_has_acted,
    "defaults.produced_unit_has_acted",
    "produced units must be marked acted",
  );
  c.check(
    d.starts_with_full_fuel,
    "defaults.starts_with_full_fuel",
    "produced units must start with full fuel",
  );
  c.check(
    d.starts_with_full_ammo,
    "defaults.starts_with_full_ammo",
    "produced units must start with full ammo",
  );

  const allowedSpriteKeys = new Set(
    file.cross_unit_constraints.rendering.allowed_sprite_keys,
  );

  for (const [key, u] of entries) {
    const at = (sub: string): string => `units.${key}.${sub}`;

    // Indirect units cannot move and attack in one activation.
    if (u.combat.type === "indirect") {
      c.check(
        u.movement.can_move_and_attack === false,
        at("movement.can_move_and_attack"),
        "indirect units cannot move and attack in the same activation",
      );
    }

    // Transport cargo and capacity rules (no nesting).
    const cap = u.transport.capacity;
    c.check(
      cap > 0 === u.capabilities.can_transport,
      at("transport.capacity"),
      `transport.capacity (${cap}) and can_transport (${u.capabilities.can_transport}) disagree`,
    );
    if (cap > 0) {
      c.check(
        u.transport.allowed_cargo.length > 0,
        at("transport.allowed_cargo"),
        "a transport must declare allowed cargo",
      );
      // Cargo IDs resolve to known units. Nesting of *loaded* cargo is an engine
      // runtime rule, not a data-shape constraint — a Lander may list the APC as
      // allowed cargo — so it is not checked here.
      for (const cargo of u.transport.allowed_cargo) {
        c.check(
          units[cargo] !== undefined,
          at("transport.allowed_cargo"),
          `cargo "${cargo}" is not a known unit`,
        );
      }
    }

    // Every bound sprite family is on the approved list.
    for (const key of spriteKeysOf(u.rendering)) {
      c.check(
        allowedSpriteKeys.has(key),
        at("rendering"),
        `sprite key "${key}" is not an approved key`,
      );
    }

    // Special-state (diver) units carry per-state daily fuel and sprite keys.
    const hasStates = u.special_states.length > 0;
    c.check(
      hasStates === "surfaced" in u.logistics.daily_fuel,
      at("logistics.daily_fuel"),
      "special-state units need per-state daily fuel; stateless units need a single value",
    );
    c.check(
      hasStates === "sprite_keys" in u.rendering,
      at("rendering"),
      "special-state units need per-state sprite keys; stateless units need a single key",
    );

    checkExpectedValues(c, key, u);
  }

  c.throwIfAny();
  return units;
}
