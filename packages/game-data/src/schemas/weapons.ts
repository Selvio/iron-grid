/**
 * `weapons.yaml` schema and intra-file validation.
 *
 * Validates weapon shape and the intra-file obligations from the file's
 * `required_validation_tests:` (ammo model per slot, indirect fire/counter
 * rules, ranges by fire mode and by specific weapon, target-domain rules, and
 * that damage lives only in `damage-chart.yaml`). Cross-file checks — weapon IDs
 * referenced by units, `used_by` resolving to enabled units — are M1-T5.
 *
 * @see docs/02-data/weapons.yaml
 * @see docs/04-development/milestones/m1-game-data.md (M1-T2)
 */

import { z } from "zod";

import {
  ammoModel,
  fireMode,
  targetDomain,
  weaponSlot,
  type TargetDomain,
} from "./enums";
import { IssueCollector, parseShape } from "./parse";

/** One weapon (`weapons.yaml` weapons.*). */
const weaponSchema = z.looseObject({
  id: z.string(),
  display_name: z.string(),
  slot: weaponSlot,
  fire_mode: fireMode,
  range: z.looseObject({ min: z.int(), max: z.int() }),
  ammo: z.looseObject({ model: ammoModel }),
  targeting: z.looseObject({ domains: z.array(targetDomain) }),
  action_rules: z.looseObject({
    can_fire_after_move: z.boolean(),
    can_counterattack: z.boolean(),
  }),
  damage: z.looseObject({ source: z.string(), generic_power: z.null() }),
  used_by: z.array(z.string()),
});

/** The top-level `weapons.yaml` document. */
const weaponsFile = z.looseObject({
  weapons: z.record(z.string(), weaponSchema),
});

/** A validated weapon. */
export type Weapon = z.infer<typeof weaponSchema>;

/** The validated weapons, keyed by weapon ID. */
export type Weapons = Readonly<Record<string, Weapon>>;

/** Exact ranges required for named non-direct weapons (`weapons.yaml` obligations). */
const EXPECTED_RANGE: Readonly<Record<string, readonly [number, number]>> = {
  artillery_cannon: [2, 3],
  rocket_launcher: [3, 5],
  surface_to_air_missiles: [3, 5],
  naval_cannon: [2, 6],
};

/** Per-weapon target-domain obligations. `include`/`exclude` are checked if present. */
const EXPECTED_DOMAINS: Readonly<
  Record<
    string,
    {
      readonly exact?: readonly TargetDomain[];
      readonly include?: readonly TargetDomain[];
      readonly exclude?: readonly TargetDomain[];
    }
  >
> = {
  anti_submarine_torpedoes: { exact: ["submarine"] }, // Cruiser primary: Submarine only
  naval_anti_air_gun: { include: ["air"] }, // Cruiser secondary: air
  submarine_torpedoes: { include: ["naval", "submarine"] },
  bombs: { exclude: ["air"] }, // Bomber cannot target air
  air_to_air_missiles: { exclude: ["ground", "naval"] }, // Fighter: air only
  surface_to_air_missiles: { exclude: ["ground", "naval"] }, // Missiles: air only
};

/**
 * Validate `weapons.yaml` and return its weapons keyed by ID.
 *
 * @throws {GameDataError} on any shape or intra-file semantic failure
 */
export function parseWeapons(raw: unknown): Weapons {
  const file = parseShape("weapons.yaml", weaponsFile, raw);
  const c = new IssueCollector("weapons.yaml");
  const weapons = file.weapons;

  for (const [key, w] of Object.entries(weapons)) {
    const at = (sub: string): string => `weapons.${key}.${sub}`;
    c.check(
      w.id === key,
      at("id"),
      `id "${w.id}" does not match its key "${key}"`,
    );

    // Ammo model is fixed by slot.
    if (w.slot === "primary") {
      c.check(
        w.ammo.model === "finite_primary_pool",
        at("ammo.model"),
        "primary weapons use a finite primary pool",
      );
    } else {
      c.check(
        w.ammo.model === "infinite",
        at("ammo.model"),
        "secondary weapons have infinite ammo",
      );
    }

    // Fire-mode rules.
    if (w.fire_mode === "indirect") {
      c.check(
        w.action_rules.can_fire_after_move === false,
        at("action_rules.can_fire_after_move"),
        "indirect weapons cannot fire after moving",
      );
      c.check(
        w.action_rules.can_counterattack === false,
        at("action_rules.can_counterattack"),
        "indirect weapons cannot counterattack",
      );
    } else {
      c.check(
        w.range.min === 1 && w.range.max === 1,
        at("range"),
        `direct weapons have range 1-1, found ${w.range.min}-${w.range.max}`,
      );
    }

    // Exact ranges for named non-direct weapons.
    const range = EXPECTED_RANGE[key];
    if (range !== undefined) {
      c.check(
        w.range.min === range[0] && w.range.max === range[1],
        at("range"),
        `${key} range must be ${range[0]}-${range[1]}, found ${w.range.min}-${w.range.max}`,
      );
    }

    // Target-domain obligations.
    const rule = EXPECTED_DOMAINS[key];
    if (rule !== undefined) {
      const domains = new Set(w.targeting.domains);
      if (rule.exact !== undefined) {
        c.check(
          domains.size === rule.exact.length &&
            rule.exact.every((dm) => domains.has(dm)),
          at("targeting.domains"),
          `${key} must target exactly [${rule.exact.join(", ")}]`,
        );
      }
      for (const dm of rule.include ?? []) {
        c.check(
          domains.has(dm),
          at("targeting.domains"),
          `${key} must be able to target ${dm}`,
        );
      }
      for (const dm of rule.exclude ?? []) {
        c.check(
          !domains.has(dm),
          at("targeting.domains"),
          `${key} must not target ${dm}`,
        );
      }
    }

    // Damage is external; no generic power values.
    c.check(
      w.damage.source === "damage-chart.yaml",
      at("damage.source"),
      "weapon damage must be sourced from damage-chart.yaml",
    );
    c.check(
      w.damage.generic_power === null,
      at("damage.generic_power"),
      "weapons must not carry generic base-power values",
    );
  }

  c.throwIfAny();
  return weapons;
}
