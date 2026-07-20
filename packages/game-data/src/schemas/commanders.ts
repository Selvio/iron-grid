/**
 * `commanders.yaml` schema and intra-file validation.
 *
 * `commanders.yaml` is **design-blocked** (`game-specification.md` §33.1): the
 * four commander slots exist but their names, passive effects, meter formulas
 * and power costs are intentionally unresolved (`null`). M1-T4 validates the
 * *contract* — faction/commander bindings, the modifier/effect/meter/power
 * vocabulary, and the guards that forbid enabling an unresolved commander —
 * without requiring the blocked values. The file must therefore pass green in
 * its blocked state; the resolved values land in M6 behind the §33.1 ADR.
 *
 * ADR-0006 resolves the **passive** half of §33.1 and splits the approval gate in
 * two: `passive.status: "approved"` makes a passive apply in play, while the
 * commander itself stays disabled until its name, meter and power resolve. Both
 * gates are enforced below.
 *
 * Modifier scope references (unit/terrain/property IDs) are cross-checked against
 * their canonical files in `validate/integrity.ts` (M1-T5) — no longer vacuous now
 * that the four passives carry real scopes.
 *
 * @see docs/02-data/commanders.yaml
 * @see docs/04-development/milestones/m1-game-data.md (M1-T4)
 */

import { z } from "zod";

import { commanderStatus, factionId, passiveStatus } from "./enums";
import { IssueCollector, parseShape } from "./parse";

/** Modifier target attributes (`commanders.yaml` enums.modifier_targets). */
const modifierTarget = z.enum([
  "attack",
  "defense",
  "movement_points",
  "vision_range",
  "min_attack_range",
  "max_attack_range",
  "fuel_capacity",
  "daily_fuel_consumption",
  "ammo_capacity",
  "unit_cost",
  "repair_cost",
  "repair_amount",
  "capture_power",
  "property_income",
  "terrain_defense_stars",
  "luck_min",
  "luck_max",
  "bad_luck_min",
  "bad_luck_max",
  "power_meter_gain",
]);

/** Modifier operations (`commanders.yaml` enums.modifier_operations). */
const modifierOperation = z.enum(["add", "multiply", "set", "min", "max"]);

/** Modifier scope kinds (`commanders.yaml` enums.modifier_scopes). */
const modifierScopeType = z.enum([
  "all_units",
  "unit_ids",
  "unit_categories",
  "movement_types",
  "terrain_ids",
  "property_ids",
]);

/**
 * A declarative gameplay modifier. Validated whenever one is present so the
 * enum vocabulary is enforced the moment commander values are resolved; scope
 * *values* are cross-checked against their canonical files in M1-T5.
 */
const modifierSchema = z.looseObject({
  id: z.string(),
  target: modifierTarget,
  operation: modifierOperation,
  value: z.number(),
  scope: z.looseObject({
    type: modifierScopeType,
    values: z.array(z.string()),
  }),
  priority: z.int(),
});

/** Commander power-meter definition; every numeric field is `null` while blocked. */
const meterSchema = z.looseObject({
  max_points: z.int().nullable(),
  initial_points: z.int(),
  power_cost: z.int().nullable(),
  gain_rules: z.looseObject({
    damage_dealt_value_multiplier: z.number().nullable(),
    damage_received_value_multiplier: z.number().nullable(),
    destroyed_unit_value_multiplier: z.number().nullable(),
    property_capture_points: z.int().nullable(),
    fixed_points_per_owner_turn: z.int().nullable(),
  }),
});

/** One faction (`commanders.yaml` factions.*). Factions carry no gameplay modifiers. */
const factionSchema = z.looseObject({
  id: factionId,
  display_name: z.string().nullable(),
  commander_id: z.string(),
  gameplay_modifiers: z.array(z.unknown()),
});

/** One commander slot (`commanders.yaml` commanders.*). */
const commanderSchema = z.looseObject({
  id: z.string(),
  display_name: z.string().nullable(),
  faction_id: factionId,
  status: commanderStatus,
  passive: z.looseObject({
    display_name: z.string().nullable(),
    description: z.string().nullable(),
    status: passiveStatus,
    modifiers: z.array(modifierSchema),
  }),
  meter: meterSchema,
  power: z.looseObject({
    id: z.string(),
    display_name: z.string().nullable(),
    cost: z.int().nullable(),
  }),
  implementation: z.looseObject({ enabled_in_mvp: z.boolean() }),
});

/** The top-level `commanders.yaml` document. */
const commandersFile = z.looseObject({
  game_reference: z.looseObject({
    iron_grid_override: z.looseObject({ super_powers_enabled: z.boolean() }),
  }),
  factions: z.record(z.string(), factionSchema),
  commanders: z.record(z.string(), commanderSchema),
  power_schema: z.looseObject({
    activation_conditions: z.looseObject({ required: z.array(z.string()) }),
  }),
  selection_rules: z.looseObject({
    second_picker: z.looseObject({
      cannot_select_first_commander: z.boolean(),
      cannot_select_first_faction: z.boolean(),
    }),
  }),
  meter_resolution: z.looseObject({ deterministic: z.boolean() }),
  power_resolution: z.looseObject({
    fog_safety: z.looseObject({ hidden_targets_must_not_leak: z.boolean() }),
    concurrency: z.looseObject({
      expected_state_version_required: z.boolean(),
    }),
  }),
});

/** A validated faction. */
export type Faction = z.infer<typeof factionSchema>;

/** A validated commander slot. */
export type Commander = z.infer<typeof commanderSchema>;

/** The validated factions and commander slots. */
export interface Commanders {
  readonly factions: Readonly<Record<string, Faction>>;
  readonly commanders: Readonly<Record<string, Commander>>;
}

const REQUIRED_FACTIONS = 4;

/** True when every declared meter field carries a resolved (non-null) number. */
function meterFullyResolved(m: Commander["meter"]): boolean {
  return (
    m.max_points !== null &&
    m.power_cost !== null &&
    Object.values(m.gain_rules).every((v) => v !== null)
  );
}

/**
 * Validate `commanders.yaml` and return its factions and commanders.
 *
 * @throws {GameDataError} on any shape or intra-file semantic failure
 */
export function parseCommanders(raw: unknown): Commanders {
  const file = parseShape("commanders.yaml", commandersFile, raw);
  const c = new IssueCollector("commanders.yaml");
  const { factions, commanders } = file;

  // Cardinalities.
  c.check(
    Object.keys(factions).length === REQUIRED_FACTIONS,
    "factions",
    `expected ${REQUIRED_FACTIONS} factions`,
  );
  c.check(
    Object.keys(commanders).length === REQUIRED_FACTIONS,
    "commanders",
    `expected ${REQUIRED_FACTIONS} commander slots`,
  );

  // One-to-one faction<->commander binding.
  for (const [key, f] of Object.entries(factions)) {
    const at = (sub: string): string => `factions.${key}.${sub}`;
    c.check(
      f.id === key,
      at("id"),
      `id "${f.id}" does not match its key "${key}"`,
    );
    c.check(
      f.gameplay_modifiers.length === 0,
      at("gameplay_modifiers"),
      "faction gameplay_modifiers must be empty",
    );
    const cmd = commanders[f.commander_id];
    c.check(
      cmd !== undefined,
      at("commander_id"),
      `commander "${f.commander_id}" does not exist`,
    );
    if (cmd !== undefined) {
      c.check(
        cmd.faction_id === f.id,
        at("commander_id"),
        `commander "${f.commander_id}" is not bound back to faction "${f.id}"`,
      );
    }
  }

  for (const [key, cmd] of Object.entries(commanders)) {
    const at = (sub: string): string => `commanders.${key}.${sub}`;
    c.check(
      cmd.id === key,
      at("id"),
      `id "${cmd.id}" does not match its key "${key}"`,
    );
    c.check(
      factions[cmd.faction_id] !== undefined,
      at("faction_id"),
      `faction "${cmd.faction_id}" does not exist`,
    );

    // The passive gate (ADR-0006), independent of `enabled_in_mvp`: an approved
    // passive is applied in play, so it must be fully described; an unapproved
    // one must carry nothing the engine could accidentally apply.
    if (cmd.passive.status === "approved") {
      c.check(
        cmd.passive.display_name !== null,
        at("passive.display_name"),
        "an approved passive needs a display name",
      );
      c.check(
        cmd.passive.description !== null,
        at("passive.description"),
        "an approved passive needs a description",
      );
      c.check(
        cmd.passive.modifiers.length > 0,
        at("passive.modifiers"),
        "an approved passive needs at least one modifier",
      );
    } else {
      c.check(
        cmd.passive.modifiers.length === 0,
        at("passive.modifiers"),
        `a passive that is not approved (status "${cmd.passive.status}") must carry no modifiers`,
      );
    }

    // A commander may only be enabled once its design is fully resolved.
    if (cmd.implementation.enabled_in_mvp) {
      c.check(
        cmd.status === "approved",
        at("status"),
        "an enabled commander must be approved, not blocked/draft/disabled",
      );
      c.check(
        cmd.display_name !== null,
        at("display_name"),
        "an enabled commander needs a display name",
      );
      c.check(
        cmd.power.cost !== null,
        at("power.cost"),
        "an enabled commander needs a resolved power cost",
      );
      c.check(
        meterFullyResolved(cmd.meter),
        at("meter"),
        "an enabled commander needs fully resolved meter rules",
      );
    }
  }

  // Contract guarantees that hold regardless of the design blocker.
  c.check(
    file.game_reference.iron_grid_override.super_powers_enabled === false,
    "game_reference.iron_grid_override.super_powers_enabled",
    "Super Powers must not be enabled",
  );
  const sp = file.selection_rules.second_picker;
  c.check(
    sp.cannot_select_first_commander,
    "selection_rules.second_picker.cannot_select_first_commander",
    "duplicate commander selection must be rejected",
  );
  c.check(
    sp.cannot_select_first_faction,
    "selection_rules.second_picker.cannot_select_first_faction",
    "duplicate faction selection must be rejected",
  );
  c.check(
    file.power_schema.activation_conditions.required.includes(
      "meter_at_least_cost",
    ),
    "power_schema.activation_conditions.required",
    "power activation must require sufficient meter",
  );
  c.check(
    file.meter_resolution.deterministic,
    "meter_resolution.deterministic",
    "meter changes must be deterministic",
  );
  c.check(
    file.power_resolution.fog_safety.hidden_targets_must_not_leak,
    "power_resolution.fog_safety.hidden_targets_must_not_leak",
    "power activation must not leak hidden targets",
  );
  c.check(
    file.power_resolution.concurrency.expected_state_version_required,
    "power_resolution.concurrency.expected_state_version_required",
    "power activation must reject stale state versions",
  );

  c.throwIfAny();
  return { factions, commanders };
}
