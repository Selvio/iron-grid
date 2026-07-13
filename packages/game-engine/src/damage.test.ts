import { describe, expect, it } from "vitest";

import { computeDamage, type DamageInput } from "./damage";

/**
 * M3-T1: the AW2 damage formula, pinned at its rounding boundaries (§12.4).
 *
 * @see docs/04-development/milestones/m3-combat-systems-fog.md (M3-T1)
 */

/** Full-HP, no-terrain baseline; override per case. */
function input(patch: Partial<DamageInput> = {}): DamageInput {
  return {
    baseDamage: 55,
    attackValue: 100,
    defenseValue: 100,
    goodLuck: 0,
    badLuck: 0,
    attackerDisplayHp: 10,
    defenderDisplayHp: 10,
    terrainStars: 0,
    defenderTrueHp: 100,
    ...patch,
  };
}

describe("computeDamage", () => {
  it("returns base damage at full HP with no terrain or luck", () => {
    expect(computeDamage(input())).toBe(55);
  });

  it("adds good luck and subtracts bad luck", () => {
    expect(computeDamage(input({ goodLuck: 9 }))).toBe(64);
    expect(computeDamage(input({ goodLuck: 9, badLuck: 4 }))).toBe(60);
  });

  it("scales damage by the attacker's displayed HP", () => {
    // Half-HP attacker deals half: 55 * 5 / 10 = 27.5 → 27.
    expect(computeDamage(input({ attackerDisplayHp: 5 }))).toBe(27);
  });

  it("reduces damage by terrain stars scaled to the defender's displayed HP", () => {
    // 2 stars, full HP: factor (200-(100+2*10))/100 = 0.8 → 55*0.8 = 44.
    expect(computeDamage(input({ terrainStars: 2 }))).toBe(44);
    // Same terrain, a weaker defender gets less protection: factor 0.9 → 49.5 → 49.
    expect(
      computeDamage(input({ terrainStars: 2, defenderDisplayHp: 5 })),
    ).toBe(49);
  });

  it("applies the two-stage rounding: up to 0.05, then down to an integer", () => {
    // base 98, 7 stars, 7-HP defender: 98 * (200-(100+49))/100 = 98*0.51 = 49.98.
    // Round up to 50.00, floor to 50 — a naive floor would give 49.
    expect(
      computeDamage(
        input({
          baseDamage: 98,
          terrainStars: 7,
          defenderDisplayHp: 7,
          defenderTrueHp: 70,
        }),
      ),
    ).toBe(50);
    // 55 * 0.9 = 49.5 → already a 0.05 multiple → floor 49.
    expect(computeDamage(input({ terrainStars: 1 }))).toBe(49);
  });

  it("clamps negative damage to zero", () => {
    // Defense factor drives raw below zero → 0.
    expect(computeDamage(input({ terrainStars: 11 }))).toBe(0);
  });

  it("caps damage at the defender's remaining true HP", () => {
    expect(computeDamage(input({ baseDamage: 100, defenderTrueHp: 30 }))).toBe(
      30,
    );
  });
});
