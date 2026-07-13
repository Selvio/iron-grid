import { describe, expect, it } from "vitest";

import { loadGameData } from "../load";
import { GameDataError } from "../errors";
import { parseUnits } from "./units";
import { parseWeapons } from "./weapons";
import { parseDamageChart, type DamageChart } from "./damage-chart";

/**
 * M1-T2: the combat-core schemas parse the real data and enforce the canonical
 * damage-chart spot-values from its `required_validation_tests:`. Systematic
 * per-check negative fixtures are M1-T6; here we prove the parsers reject
 * malformed input and that the reference matrix values are intact.
 *
 * @see docs/02-data/damage-chart.yaml (required_validation_tests)
 * @see docs/04-development/milestones/m1-game-data.md (M1-T2)
 */
const data = loadGameData();

/** Base damage for one attacker→defender weapon slot, or null when illegal. */
function base(
  chart: DamageChart,
  att: string,
  def: string,
  slot: "primary" | "secondary",
): number | null {
  const cell = chart.attackers[att]?.matchups[def]?.weapon_values[slot];
  return cell == null ? null : cell.base_damage;
}

describe("combat-core cardinalities", () => {
  it("has 19 enabled units", () => {
    const enabled = Object.values(data.units).filter((u) => u.enabled_in_mvp);
    expect(enabled).toHaveLength(19);
  });

  it("charts 16 armed attackers and 20 defenders", () => {
    expect(data.damageChart.attacker_order).toHaveLength(16);
    expect(data.damageChart.defender_order).toHaveLength(20);
  });
});

describe("damage-chart reference values (required_validation_tests)", () => {
  const c = data.damageChart;

  it("selects the higher-damage weapon on mixed matchups", () => {
    expect(base(c, "tank", "infantry", "secondary")).toBe(75);
    expect(base(c, "tank", "tank", "primary")).toBe(55);
    expect(base(c, "mech", "tank", "primary")).toBe(55);
    expect(base(c, "battle_copter", "infantry", "secondary")).toBe(75);
  });

  it("keeps naval and air reference damage", () => {
    expect(base(c, "cruiser", "submarine", "primary")).toBe(90);
    expect(base(c, "submarine", "submarine", "primary")).toBe(55);
    expect(base(c, "fighter", "bomber", "primary")).toBe(100);
    expect(base(c, "missiles", "fighter", "primary")).toBe(120);
    expect(base(c, "missiles", "bomber", "primary")).toBe(120);
    expect(base(c, "battleship", "infantry", "primary")).toBe(95);
  });

  it("forbids attacking a submerged submarine where AW2 does", () => {
    expect(
      c.attackers.tank?.matchups.submarine?.automatic_selection_by_state
        ?.submerged,
    ).toBeNull();
    expect(
      c.attackers.bomber?.matchups.submarine?.automatic_selection_by_state
        ?.submerged,
    ).toBeNull();
    expect(base(c, "bomber", "submarine", "primary")).toBe(95); // surfaced only
  });
});

describe("parsers reject malformed input", () => {
  it("throws GameDataError, not a raw ZodError", () => {
    expect(() => parseUnits({})).toThrow(GameDataError);
    expect(() => parseWeapons({})).toThrow(GameDataError);
    expect(() => parseDamageChart({})).toThrow(GameDataError);
  });
});
