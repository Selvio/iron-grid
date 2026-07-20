import { describe, expect, it } from "vitest";

import { loadGameData, type GameData } from "game-data";

import { calculateCombatPreview } from "./combat";
import { ownerModifier } from "./commanders";
import type { AttackAction } from "./actions";
import type {
  Coordinate,
  MatchMeta,
  MatchState,
  PlayerState,
  UnitState,
} from "./state";

/**
 * Acceptance tests for the four approved commander passives (ADR-0006).
 *
 * These run against the **real** `commanders.yaml` (via `loadGameData`), not
 * synthetic fixtures — `commanders.test.ts` covers the mechanism, this file
 * covers the shipped design. `commanders.yaml`
 * (`design_requirements_before_approval`) requires per-commander acceptance
 * tests, that no commander is strictly better in every situation, and that all
 * six commander pairings are exercised; all three are asserted below.
 *
 * Only the map is synthetic: a one-row board of chosen terrain is grafted onto
 * the real data so a tile's effect is isolated. Units, terrain, the damage chart
 * and the commanders themselves are the canonical ones.
 *
 * @see docs/decisions/0006-commander-passive-effects.md
 */

const REAL = loadGameData();

/** Every tile the passives care about, in a fixed order, as a 1×N map. */
const LANE = [
  "plain",
  "forest",
  "mountain",
  "city",
  "road",
  "shoal",
  "sea",
] as const;
type Tile = (typeof LANE)[number];

const MAP_ID = "passive_lane";

/** The real game data with a one-row test map appended. */
const GAME_DATA: GameData = {
  ...REAL,
  maps: {
    ...REAL.maps,
    [MAP_ID]: {
      dimensions: { width: LANE.length, height: 1 },
      logical_terrain: [[...LANE]],
    },
  },
} as unknown as GameData;

const tileX = (tile: Tile): number => LANE.indexOf(tile);
const at = (tile: Tile): Coordinate => ({ x: tileX(tile), y: 0 });

/** The four approved commanders, plus the no-commander baseline. */
const BLUE = "commander_blue";
const GREEN = "commander_green";
const RED = "commander_red";
const YELLOW = "commander_yellow";
const NONE = "commander_absent"; // resolves to nothing → every modifier is 0
const ALL = [BLUE, GREEN, RED, YELLOW] as const;

function player(id: string, commanderId: string): PlayerState {
  return {
    playerId: id,
    userId: `u_${id}`,
    factionId: "blue",
    commanderId,
    funds: 0,
    powerMeter: 0,
    ready: true,
    resigned: false,
  };
}

function unit(
  id: string,
  typeId: string,
  ownerPlayerId: string,
  position: Coordinate,
): UnitState {
  return {
    id,
    typeId,
    ownerPlayerId,
    position,
    trueHp: 100,
    fuel: 99,
    ammo: 9,
    hasActed: false,
    captureTargetPropertyId: null,
    cargoUnitIds: [],
    specialState: null,
    createdTurn: 0,
  };
}

function match(): MatchMeta {
  return {
    id: "m1",
    status: "active",
    dataVersion: REAL.version,
    mapId: MAP_ID,
    stateVersion: 1,
    currentDay: 1,
    activePlayerId: "p1",
    firstPlayerId: "p1",
    startedAt: null,
    completedAt: null,
    winnerPlayerId: null,
    completionReason: null,
    turnDeadlineAt: null,
    expiredTurnClaimAvailableTo: null,
    deterministicSeed: "seed",
    randomSequenceIndex: 0,
  };
}

interface Duel {
  /** Attacker's commander. */
  readonly attacker: string;
  /** Defender's commander. */
  readonly defender: string;
  readonly attackerType: string;
  readonly defenderType: string;
  /** Tiles both units stand on; defaults to open plain. */
  readonly attackerTile?: Tile;
  readonly defenderTile?: Tile;
}

/** Max damage of one hit, which is the luck-free ceiling the preview reports. */
function damage(duel: Duel): number {
  const attackerTile = duel.attackerTile ?? "plain";
  // Both units cannot share a tile; keep the defender on its own by default.
  const defenderTile = duel.defenderTile ?? "road";
  const state: MatchState = {
    match: match(),
    players: [player("p1", duel.attacker), player("p2", duel.defender)],
    units: [
      unit("a", duel.attackerType, "p1", at(attackerTile)),
      unit("d", duel.defenderType, "p2", at(defenderTile)),
    ],
    properties: [],
    terrainObjects: [],
  };
  const action: AttackAction = {
    type: "attack",
    matchId: "m1",
    playerId: "p1",
    expectedStateVersion: 1,
    idempotencyKey: "k",
    unitId: "a",
    targetUnitId: "d",
    path: [],
  };
  return calculateCombatPreview(state, action, GAME_DATA).maxDamage;
}

/** The additive modifier a commander applies to `target` for `unitTypeId`. */
function modifier(
  commanderId: string,
  target: Parameters<typeof ownerModifier>[3],
  unitTypeId?: string,
  terrainId?: string,
): number {
  const state: MatchState = {
    match: match(),
    players: [player("p1", commanderId)],
    units: [],
    properties: [],
    terrainObjects: [],
  };
  return ownerModifier(state, "p1", GAME_DATA, target, unitTypeId, terrainId);
}

const FOOTSOLDIERS = ["infantry", "mech"] as const;
/** Blue's bonus class: direct-fire ground vehicles, footsoldiers excluded. */
const DIRECT_GROUND_VEHICLES = [
  "recon",
  "tank",
  "anti_air",
  "medium_tank",
  "neotank",
] as const;
const DIRECT_GROUND = [...FOOTSOLDIERS, ...DIRECT_GROUND_VEHICLES] as const;
const INDIRECT = ["artillery", "missiles", "rockets", "battleship"] as const;
const DIRECT_NON_GROUND = [
  "battle_copter",
  "fighter",
  "bomber",
  "cruiser",
  "submarine",
] as const;

describe("the approved passives are the ones this suite asserts", () => {
  it("ships exactly four approved passives, each named and described", () => {
    for (const id of ALL) {
      const commander = REAL.commanders.commanders[id]!;
      expect(commander.passive.status).toBe("approved");
      expect(commander.passive.display_name).not.toBeNull();
      expect(commander.passive.description).not.toBeNull();
      expect(commander.passive.modifiers.length).toBeGreaterThan(0);
    }
  });

  it("keeps every power design-blocked, so none can be activated", () => {
    for (const id of ALL) {
      const commander = REAL.commanders.commanders[id]!;
      expect(commander.power.cost).toBeNull();
      expect(commander.implementation.enabled_in_mvp).toBe(false);
    }
  });

  it("uses no degenerate lever — cost, capture, luck or range (ADR-0006)", () => {
    const forbidden = new Set([
      "unit_cost",
      "capture_power",
      "min_attack_range",
      "max_attack_range",
      "luck_min",
      "luck_max",
      "bad_luck_min",
      "bad_luck_max",
    ]);
    for (const id of ALL) {
      for (const m of REAL.commanders.commanders[id]!.passive.modifiers) {
        expect(forbidden.has(m.target)).toBe(false);
      }
    }
  });

  it("applies nothing for a commander that does not resolve", () => {
    expect(modifier(NONE, "attack", "tank")).toBe(0);
    expect(modifier(NONE, "defense", "tank", "plain")).toBe(0);
  });
});

describe("blue — Spearhead", () => {
  it.each(DIRECT_GROUND_VEHICLES)("gives %s +15 attack", (typeId) => {
    expect(modifier(BLUE, "attack", typeId)).toBe(15);
  });

  it.each(FOOTSOLDIERS)(
    "leaves %s alone — that is yellow's identity",
    (typeId) => {
      expect(modifier(BLUE, "attack", typeId)).toBe(0);
    },
  );

  it.each(INDIRECT)("takes 15 attack off %s", (typeId) => {
    expect(modifier(BLUE, "attack", typeId)).toBe(-15);
  });

  it.each(DIRECT_NON_GROUND)(
    "leaves %s alone — the bonus is ground-only",
    (typeId) => {
      expect(modifier(BLUE, "attack", typeId)).toBe(0);
    },
  );

  it("changes no defense value", () => {
    for (const typeId of [...DIRECT_GROUND, ...INDIRECT]) {
      expect(modifier(BLUE, "defense", typeId, "plain")).toBe(0);
    }
  });

  it("out-damages a commander-less army with a tank", () => {
    const base = damage({
      attacker: NONE,
      defender: NONE,
      attackerType: "tank",
      defenderType: "tank",
    });
    const spearhead = damage({
      attacker: BLUE,
      defender: NONE,
      attackerType: "tank",
      defenderType: "tank",
    });
    expect(base).toBeGreaterThan(0);
    expect(spearhead).toBeGreaterThan(base);
  });

  it("under-damages with artillery — the penalty is paid", () => {
    const base = damage({
      attacker: NONE,
      defender: NONE,
      attackerType: "artillery",
      defenderType: "tank",
    });
    const spearhead = damage({
      attacker: BLUE,
      defender: NONE,
      attackerType: "artillery",
      defenderType: "tank",
    });
    expect(spearhead).toBeLessThan(base);
  });

  it("defends exactly like a commander-less army", () => {
    const base = damage({
      attacker: NONE,
      defender: NONE,
      attackerType: "tank",
      defenderType: "tank",
    });
    const vsBlue = damage({
      attacker: NONE,
      defender: BLUE,
      attackerType: "tank",
      defenderType: "tank",
    });
    expect(vsBlue).toBe(base);
  });

  it("gains nothing from terrain — the passive is unconditional", () => {
    const onPlain = damage({
      attacker: BLUE,
      defender: NONE,
      attackerType: "tank",
      defenderType: "tank",
      attackerTile: "plain",
    });
    const onForest = damage({
      attacker: BLUE,
      defender: NONE,
      attackerType: "tank",
      defenderType: "tank",
      attackerTile: "forest",
    });
    expect(onForest).toBe(onPlain);
  });
});

describe("green — Entrenched", () => {
  it.each(["forest", "mountain", "city"] as const)(
    "adds one defense star on %s",
    (tile) => {
      expect(modifier(GREEN, "terrain_defense_stars", "tank", tile)).toBe(1);
    },
  );

  it.each(["plain", "road", "shoal"] as const)(
    "takes 10 defense off on %s",
    (tile) => {
      expect(modifier(GREEN, "defense", "tank", tile)).toBe(-10);
    },
  );

  it("adds no star on the tiles it is penalised on", () => {
    for (const tile of ["plain", "road", "shoal"] as const) {
      expect(modifier(GREEN, "terrain_defense_stars", "tank", tile)).toBe(0);
    }
  });

  it("takes damage on open ground that a commander-less army would not", () => {
    const base = damage({
      attacker: NONE,
      defender: NONE,
      attackerType: "tank",
      defenderType: "tank",
      defenderTile: "plain",
    });
    const green = damage({
      attacker: NONE,
      defender: GREEN,
      attackerType: "tank",
      defenderType: "tank",
      defenderTile: "plain",
    });
    expect(green).toBeGreaterThan(base);
  });

  it("takes less damage in a forest than a commander-less army does", () => {
    const base = damage({
      attacker: NONE,
      defender: NONE,
      attackerType: "tank",
      defenderType: "tank",
      defenderTile: "forest",
    });
    const green = damage({
      attacker: NONE,
      defender: GREEN,
      attackerType: "tank",
      defenderType: "tank",
      defenderTile: "forest",
    });
    expect(green).toBeLessThan(base);
  });

  it("is unaffected on a tile in neither list", () => {
    const base = damage({
      attacker: NONE,
      defender: NONE,
      attackerType: "tank",
      defenderType: "tank",
      defenderTile: "sea",
    });
    const green = damage({
      attacker: NONE,
      defender: GREEN,
      attackerType: "tank",
      defenderType: "tank",
      defenderTile: "sea",
    });
    expect(green).toBe(base);
  });

  it.each(["plain", "road", "shoal"] as const)(
    "does not penalise aircraft over %s — the bonus can never reach them either",
    (tile) => {
      const base = damage({
        attacker: NONE,
        defender: NONE,
        attackerType: "fighter",
        defenderType: "battle_copter",
        defenderTile: tile,
      });
      const green = damage({
        attacker: NONE,
        defender: GREEN,
        attackerType: "fighter",
        defenderType: "battle_copter",
        defenderTile: tile,
      });
      expect(green).toBe(base);
    },
  );

  it("does not change an aircraft's own attack over a scoped tile", () => {
    const base = damage({
      attacker: NONE,
      defender: NONE,
      attackerType: "battle_copter",
      defenderType: "tank",
      attackerTile: "forest",
    });
    const green = damage({
      attacker: GREEN,
      defender: NONE,
      attackerType: "battle_copter",
      defenderType: "tank",
      attackerTile: "forest",
    });
    expect(green).toBe(base);
  });

  it("never shelters aircraft — terrain grants them no stars", () => {
    const base = damage({
      attacker: NONE,
      defender: NONE,
      attackerType: "fighter",
      defenderType: "battle_copter",
      defenderTile: "forest",
    });
    const green = damage({
      attacker: NONE,
      defender: GREEN,
      attackerType: "fighter",
      defenderType: "battle_copter",
      defenderTile: "forest",
    });
    expect(green).toBe(base);
  });

  it("changes no attack value", () => {
    for (const tile of LANE) {
      expect(modifier(GREEN, "attack", "tank", tile)).toBe(0);
    }
  });

  it("is denied by pulling the fight into the open — the counterplay", () => {
    const inCover = damage({
      attacker: NONE,
      defender: GREEN,
      attackerType: "tank",
      defenderType: "tank",
      defenderTile: "mountain",
    });
    const inTheOpen = damage({
      attacker: NONE,
      defender: GREEN,
      attackerType: "tank",
      defenderType: "tank",
      defenderTile: "plain",
    });
    expect(inTheOpen).toBeGreaterThan(inCover);
  });
});

describe("red — Barrage", () => {
  it.each(INDIRECT)("gives %s +20 attack", (typeId) => {
    expect(modifier(RED, "attack", typeId)).toBe(20);
  });

  it.each([...DIRECT_GROUND, ...DIRECT_NON_GROUND])(
    "takes 10 attack off %s",
    (typeId) => {
      expect(modifier(RED, "attack", typeId)).toBe(-10);
    },
  );

  it("grants no extra attack range — the degenerate lever is avoided", () => {
    for (const typeId of INDIRECT) {
      expect(modifier(RED, "max_attack_range", typeId)).toBe(0);
      expect(modifier(RED, "min_attack_range", typeId)).toBe(0);
    }
  });

  it("out-damages a commander-less army with artillery", () => {
    const base = damage({
      attacker: NONE,
      defender: NONE,
      attackerType: "artillery",
      defenderType: "tank",
    });
    const barrage = damage({
      attacker: RED,
      defender: NONE,
      attackerType: "artillery",
      defenderType: "tank",
    });
    expect(barrage).toBeGreaterThan(base);
  });

  it("under-damages at point-blank range with a tank", () => {
    const base = damage({
      attacker: NONE,
      defender: NONE,
      attackerType: "tank",
      defenderType: "tank",
    });
    const barrage = damage({
      attacker: RED,
      defender: NONE,
      attackerType: "tank",
      defenderType: "tank",
    });
    expect(barrage).toBeLessThan(base);
  });

  it("changes no defense value", () => {
    for (const typeId of [...DIRECT_GROUND, ...INDIRECT]) {
      expect(modifier(RED, "defense", typeId, "plain")).toBe(0);
    }
  });

  it("is the mirror of blue: each wins with the class the other is weak in", () => {
    const redArtillery = damage({
      attacker: RED,
      defender: NONE,
      attackerType: "artillery",
      defenderType: "tank",
    });
    const blueArtillery = damage({
      attacker: BLUE,
      defender: NONE,
      attackerType: "artillery",
      defenderType: "tank",
    });
    const redTank = damage({
      attacker: RED,
      defender: NONE,
      attackerType: "tank",
      defenderType: "tank",
    });
    const blueTank = damage({
      attacker: BLUE,
      defender: NONE,
      attackerType: "tank",
      defenderType: "tank",
    });
    expect(redArtillery).toBeGreaterThan(blueArtillery);
    expect(blueTank).toBeGreaterThan(redTank);
  });
});

describe("yellow — Rifle Corps", () => {
  it.each(["infantry", "mech"] as const)("gives %s +15 attack", (typeId) => {
    expect(modifier(YELLOW, "attack", typeId)).toBe(15);
  });

  it.each(["recon", "missiles", "rockets"] as const)(
    "takes 10 defense off wheeled %s",
    (typeId) => {
      expect(modifier(YELLOW, "defense", typeId, "plain")).toBe(-10);
    },
  );

  it.each([
    "tank",
    "medium_tank",
    "neotank",
    "anti_air",
    "artillery",
    "apc",
  ] as const)("takes 10 defense off tracked %s", (typeId) => {
    expect(modifier(YELLOW, "defense", typeId, "plain")).toBe(-10);
  });

  it("leaves footsoldier defense untouched", () => {
    expect(modifier(YELLOW, "defense", "infantry", "plain")).toBe(0);
    expect(modifier(YELLOW, "defense", "mech", "plain")).toBe(0);
  });

  it("does not touch capture speed — the degenerate lever is avoided", () => {
    expect(modifier(YELLOW, "capture_power", "infantry")).toBe(0);
    expect(modifier(YELLOW, "capture_power", "mech")).toBe(0);
  });

  it("out-damages a commander-less army with infantry", () => {
    const base = damage({
      attacker: NONE,
      defender: NONE,
      attackerType: "infantry",
      defenderType: "infantry",
    });
    const rifles = damage({
      attacker: YELLOW,
      defender: NONE,
      attackerType: "infantry",
      defenderType: "infantry",
    });
    expect(rifles).toBeGreaterThan(base);
  });

  it("loses its vehicles faster than a commander-less army does", () => {
    const base = damage({
      attacker: NONE,
      defender: NONE,
      attackerType: "tank",
      defenderType: "tank",
    });
    const vsYellow = damage({
      attacker: NONE,
      defender: YELLOW,
      attackerType: "tank",
      defenderType: "tank",
    });
    expect(vsYellow).toBeGreaterThan(base);
  });

  it("gives its vehicles no attack bonus to compensate", () => {
    expect(modifier(YELLOW, "attack", "tank")).toBe(0);
    expect(modifier(YELLOW, "attack", "recon")).toBe(0);
  });

  it("beats blue in a footsoldier duel but loses the armour duel", () => {
    const yellowInfantry = damage({
      attacker: YELLOW,
      defender: NONE,
      attackerType: "infantry",
      defenderType: "infantry",
    });
    const blueInfantry = damage({
      attacker: BLUE,
      defender: NONE,
      attackerType: "infantry",
      defenderType: "infantry",
    });
    expect(yellowInfantry).toBeGreaterThan(blueInfantry);

    const blueTankVsYellow = damage({
      attacker: BLUE,
      defender: YELLOW,
      attackerType: "tank",
      defenderType: "tank",
    });
    const yellowTankVsBlue = damage({
      attacker: YELLOW,
      defender: BLUE,
      attackerType: "tank",
      defenderType: "tank",
    });
    expect(blueTankVsYellow).toBeGreaterThan(yellowTankVsBlue);
  });
});

describe("global balance (commanders.yaml design_requirements.global_balance)", () => {
  /** Scenarios a commander can be strong or weak in, as attacker or defender. */
  const SCENARIOS = [
    { attackerType: "tank", defenderType: "tank", defenderTile: "plain" },
    { attackerType: "artillery", defenderType: "tank", defenderTile: "plain" },
    {
      attackerType: "infantry",
      defenderType: "infantry",
      defenderTile: "plain",
    },
    { attackerType: "tank", defenderType: "tank", defenderTile: "mountain" },
  ] as const;

  it("exercises all six commander pairings in both directions", () => {
    const pairs = new Set<string>();
    for (const a of ALL) {
      for (const b of ALL) {
        if (a === b) continue;
        for (const scenario of SCENARIOS) {
          expect(
            damage({ attacker: a, defender: b, ...scenario }),
          ).toBeGreaterThanOrEqual(0);
        }
        pairs.add([a, b].sort().join("|"));
      }
    }
    expect(pairs.size).toBe(6);
  });

  it("leaves no commander strictly better than another in every situation", () => {
    for (const a of ALL) {
      for (const b of ALL) {
        if (a === b) continue;
        // `a` attacks `b`, then `b` attacks `a`, across the scenario set: each
        // commander must come out ahead somewhere, or it is strictly dominated.
        const aWins = SCENARIOS.some(
          (s) =>
            damage({ attacker: a, defender: b, ...s }) >
            damage({ attacker: b, defender: a, ...s }),
        );
        expect(aWins, `${a} is strictly dominated by ${b}`).toBe(true);
      }
    }
  });

  it("keeps every passive scoped — none is army-wide (the +10/+10 ceiling case)", () => {
    for (const id of ALL) {
      for (const m of REAL.commanders.commanders[id]!.passive.modifiers) {
        // An `all_units` modifier would be the army-wide shape the research caps
        // at +10/+10; every shipped passive is scoped to a class or to terrain,
        // which is what pays for the larger magnitudes (ADR-0006).
        expect(m.scope.type).not.toBe("all_units");
        expect(m.scope.values.length).toBeGreaterThan(0);
        if (m.target === "attack" || m.target === "defense") {
          expect(Math.abs(m.value)).toBeLessThanOrEqual(20);
        }
      }
    }
  });
});
