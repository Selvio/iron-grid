import { readFileSync } from "node:fs";
import { join } from "node:path";

import { load as parseYaml } from "js-yaml";
import { describe, expect, it } from "vitest";

import { loadGameData, resolveVersion } from "../load";
import { DATA_FILES } from "../game-data";
import { resolveDataDir } from "../paths";
import { GameDataError } from "../errors";
import { parseUnits } from "../schemas/units";
import { parseWeapons } from "../schemas/weapons";
import { parseDamageChart } from "../schemas/damage-chart";
import { parseTerrain } from "../schemas/terrain";
import { parseProperties } from "../schemas/properties";
import { parseCommanders } from "../schemas/commanders";

/**
 * M1-T6: the data-validation test layer (`testing.md` §4). A validation failure
 * must be a build failure, so this runs under `pnpm test:run` (and thus CI). It
 * proves the real data loads and that each class of `required_validation_tests` /
 * §31.1 obligation bites, by cloning a valid raw file and mutating one field.
 * Coverage is focused (one representative fixture per check class), not
 * exhaustive.
 *
 * @see docs/04-development/milestones/m1-game-data.md (M1-T6)
 * @see docs/01-specification/game-specification.md §31.1, §31.2
 */

const DATA_DIR = resolveDataDir();
const rawCache = new Map<string, unknown>();

/** The parsed contents of one canonical file, before validation. */
function rawOf(name: string): unknown {
  if (!rawCache.has(name))
    rawCache.set(
      name,
      parseYaml(readFileSync(join(DATA_DIR, `${name}.yaml`), "utf8")),
    );
  return rawCache.get(name);
}

/** Deep-clone a raw file and set the value at a dotted path (creating nothing new). */
function withValue(name: string, path: string, value: unknown): unknown {
  const clone = structuredClone(rawOf(name));
  const keys = path.split(".");
  // Dynamic descent into an untyped clone is the point of a fixture harness.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let node: any = clone;
  for (const key of keys.slice(0, -1)) node = node[key];
  node[keys[keys.length - 1]] = value;
  return clone;
}

/** Deep-clone a raw file and delete the leaf at a dotted path. */
function without(name: string, path: string): unknown {
  const clone = structuredClone(rawOf(name));
  const keys = path.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let node: any = clone;
  for (const key of keys.slice(0, -1)) node = node[key];
  delete node[keys[keys.length - 1]];
  return clone;
}

/** Assert `fn` throws a `GameDataError` whose message names the expected fault. */
function reject(fn: () => unknown, needle: string): void {
  expect(fn).toThrow(GameDataError);
  expect(fn).toThrow(needle);
}

describe("valid data loads (positive)", () => {
  const data = loadGameData();

  it("returns a fully typed, version-stamped GameData with expected cardinalities", () => {
    expect(data.version).toBe("1.0.0");
    expect(
      Object.values(data.units).filter((u) => u.enabled_in_mvp),
    ).toHaveLength(19);
    expect(Object.keys(data.weapons)).toHaveLength(17);
    expect(data.damageChart.attacker_order).toHaveLength(16);
    expect(data.damageChart.defender_order).toHaveLength(20);
    expect(Object.keys(data.terrain)).toHaveLength(19);
    expect(Object.keys(data.properties)).toHaveLength(5);
    expect(Object.keys(data.commanders.commanders)).toHaveLength(4);
    expect(Object.keys(data.maps)).toHaveLength(1); // the first official map (M10)
  });
});

describe("versioning (§31.2)", () => {
  /** All eight files agreeing on a version, with per-file overrides. */
  function versions(
    overrides: Record<string, unknown> = {},
  ): Record<string, Record<string, unknown>> {
    const map: Record<string, Record<string, unknown>> = {};
    for (const name of DATA_FILES) map[name] = { schema_version: "1.0.0" };
    return {
      ...map,
      ...(overrides as Record<string, Record<string, unknown>>),
    };
  }

  it("stamps the shared version when all files agree", () => {
    expect(resolveVersion(versions())).toBe("1.0.0");
  });

  it("rejects a version disagreement", () => {
    reject(
      () => resolveVersion(versions({ units: { schema_version: "2.0.0" } })),
      "disagree on schema_version",
    );
  });

  it("rejects a missing version", () => {
    reject(
      () => resolveVersion(versions({ maps: {} })),
      "missing or non-string schema_version",
    );
  });
});

describe("units obligations", () => {
  it("requires exactly 19 enabled units", () => {
    reject(
      () =>
        parseUnits(withValue("units", "units.infantry.enabled_in_mvp", false)),
      "19 enabled units",
    );
  });
  it("requires each id to match its key", () => {
    reject(
      () => parseUnits(withValue("units", "units.infantry.id", "grunt")),
      "does not match its key",
    );
  });
  it("forbids indirect units moving and attacking", () => {
    reject(
      () =>
        parseUnits(
          withValue(
            "units",
            "units.artillery.movement.can_move_and_attack",
            true,
          ),
        ),
      "cannot move and attack",
    );
  });
  it("enforces transport capacity/can_transport agreement", () => {
    reject(
      () => parseUnits(withValue("units", "units.apc.transport.capacity", 0)),
      "disagree",
    );
  });
  it("rejects an unapproved sprite key", () => {
    reject(
      () =>
        parseUnits(
          withValue(
            "units",
            "units.infantry.rendering.sprite_key",
            "not_a_unit",
          ),
        ),
      "not an approved key",
    );
  });
  it("enforces the validation.expected self-checks", () => {
    reject(
      () => parseUnits(withValue("units", "units.infantry.cost", 1234)),
      "expected_cost",
    );
  });
  it("requires produced units to start acted", () => {
    reject(
      () =>
        parseUnits(
          withValue("units", "defaults.produced_unit_has_acted", false),
        ),
      "must be marked acted",
    );
  });
});

describe("weapons obligations", () => {
  it("requires primary weapons to use a finite pool", () => {
    reject(
      () =>
        parseWeapons(
          withValue("weapons", "weapons.bazooka.ammo.model", "infinite"),
        ),
      "finite primary pool",
    );
  });
  it("requires direct weapons to have range 1-1", () => {
    reject(
      () =>
        parseWeapons(withValue("weapons", "weapons.machine_gun.range.max", 2)),
      "range 1-1",
    );
  });
  it("forbids indirect weapons from counterattacking", () => {
    reject(
      () =>
        parseWeapons(
          withValue(
            "weapons",
            "weapons.artillery_cannon.action_rules.can_counterattack",
            true,
          ),
        ),
      "cannot counterattack",
    );
  });
  it("enforces target-domain rules", () => {
    reject(
      () =>
        parseWeapons(
          withValue("weapons", "weapons.bombs.targeting.domains", [
            "ground",
            "air",
          ]),
        ),
      "must not target air",
    );
  });
  it("forbids generic base-power values", () => {
    reject(
      () =>
        parseWeapons(
          withValue("weapons", "weapons.machine_gun.damage.generic_power", 10),
        ),
      "generic_power",
    );
  });
});

describe("damage-chart obligations", () => {
  it("rejects a base-damage value out of the 1..125 range", () => {
    reject(
      () =>
        parseDamageChart(
          withValue(
            "damage-chart",
            "attackers.infantry.matchups.infantry.weapon_values.secondary.base_damage",
            200,
          ),
        ),
      "base_damage",
    );
  });
  it("requires every attacker to cover every defender", () => {
    reject(
      () =>
        parseDamageChart(
          without("damage-chart", "attackers.infantry.matchups.infantry"),
        ),
      "missing matchup",
    );
  });
});

describe("terrain obligations", () => {
  it("ties official-map use to confirmed art", () => {
    reject(
      () =>
        parseTerrain(
          withValue("terrain", "terrains.plain.official_map_allowed", false),
        ),
      "official_map_allowed must equal",
    );
  });
  it("keeps pipes impassable", () => {
    reject(
      () =>
        parseTerrain(
          withValue("terrain", "terrains.pipe.movement_costs.foot", 1),
        ),
      "must be impassable",
    );
  });
  it("keeps Broken Pipe Seam equal to Plain", () => {
    reject(
      () =>
        parseTerrain(
          withValue("terrain", "terrains.broken_pipe_seam.defense_stars", 4),
        ),
      "share Plain's defense",
    );
  });
});

describe("properties obligations", () => {
  it("keeps capture points uniform at 20", () => {
    reject(
      () =>
        parseProperties(
          withValue("properties", "properties.city.max_capture_points", 30),
        ),
      "must be 20",
    );
  });
  it("keeps a producer list sized to its category", () => {
    reject(
      () =>
        parseProperties(
          withValue(
            "properties",
            "properties.base.production.allowed_unit_ids",
            ["infantry"],
          ),
        ),
      "produced units",
    );
  });
  it("keeps only Infantry and Mech capture-capable", () => {
    reject(
      () =>
        parseProperties(
          withValue("properties", "properties.city.capture.eligible_unit_ids", [
            "infantry",
          ]),
        ),
      "Infantry and Mech",
    );
  });
  it("keeps headquarters defeat-on-capture", () => {
    reject(
      () =>
        parseProperties(
          withValue(
            "properties",
            "properties.headquarters.defeat.triggers_defeat_on_capture",
            false,
          ),
        ),
      "must be true",
    );
  });
});

describe("commanders obligations", () => {
  it("forbids enabling a blocked commander", () => {
    reject(
      () =>
        parseCommanders(
          withValue(
            "commanders",
            "commanders.commander_blue.implementation.enabled_in_mvp",
            true,
          ),
        ),
      "must be approved",
    );
  });
  it("keeps faction gameplay_modifiers empty", () => {
    reject(
      () =>
        parseCommanders(
          withValue("commanders", "factions.blue.gameplay_modifiers", [
            { id: "x" },
          ]),
        ),
      "must be empty",
    );
  });
  it("forbids Super Powers", () => {
    reject(
      () =>
        parseCommanders(
          withValue(
            "commanders",
            "game_reference.iron_grid_override.super_powers_enabled",
            true,
          ),
        ),
      "Super Powers",
    );
  });
});
