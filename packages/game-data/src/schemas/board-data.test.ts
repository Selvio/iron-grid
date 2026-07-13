import { describe, expect, it } from "vitest";

import { loadGameData } from "../load";
import { GameDataError } from "../errors";
import { parseTerrain } from "./terrain";
import { parseProperties } from "./properties";

/**
 * M1-T3: the terrain and property schemas parse the real data and pin the
 * canonical AW2 reference values from each file's `required_validation_tests:`.
 * These spot-values live as tests (not loader logic) so a rebalance is not a
 * build failure; the structural invariants are enforced in the loader itself.
 *
 * @see docs/02-data/terrain.yaml (required_validation_tests)
 * @see docs/02-data/properties.yaml (required_validation_tests)
 * @see docs/04-development/milestones/m1-game-data.md (M1-T3)
 */
const data = loadGameData();

describe("terrain reference movement costs", () => {
  const t = data.terrain;
  const cost = (id: string) => t[id]?.movement_costs;

  it("keeps land traversal costs", () => {
    expect(cost("plain")).toMatchObject({
      foot: 1,
      mech: 1,
      tires: 2,
      treads: 1,
      air: 1,
    });
    expect(cost("forest")).toMatchObject({
      foot: 1,
      mech: 1,
      tires: 3,
      treads: 2,
      air: 1,
    });
    expect(cost("mountain")).toMatchObject({
      foot: 2,
      mech: 1,
      tires: null,
      treads: null,
    });
    expect(cost("river")).toMatchObject({
      foot: 2,
      mech: 1,
      tires: null,
      treads: null,
    });
    expect(cost("road")).toMatchObject({
      foot: 1,
      mech: 1,
      tires: 1,
      treads: 1,
    });
    expect(cost("bridge")).toMatchObject({
      foot: 1,
      mech: 1,
      tires: 1,
      treads: 1,
    });
  });

  it("keeps water traversal costs", () => {
    expect(cost("sea")).toMatchObject({ ship: 1, transport_ship: 1 });
    expect(cost("reef")).toMatchObject({ ship: 2, transport_ship: 2 });
    expect(cost("shoal")).toMatchObject({
      foot: 1,
      mech: 1,
      tires: 1,
      treads: 1,
      ship: null,
      transport_ship: 1,
    });
    expect(cost("port")).toMatchObject({
      foot: 1,
      mech: 1,
      tires: 1,
      treads: 1,
      air: 1,
      ship: 1,
      transport_ship: 1,
    });
  });
});

describe("terrain fog and defense", () => {
  const t = data.terrain;

  it("conceals ground in forest and naval in reef, never air", () => {
    expect(t.forest?.fog.concealment).toBe("ground");
    expect(t.reef?.fog.concealment).toBe("naval");
  });

  it("grants Mountain +3 vision to Infantry and Mech only", () => {
    expect(t.mountain?.fog.vision_bonus).toMatchObject({
      eligible_unit_types: ["infantry", "mech"],
      amount: 3,
    });
  });

  it("uses the AW2 defense stars for structures", () => {
    for (const id of [
      "city",
      "base",
      "airport",
      "port",
      "missile_silo",
      "used_missile_silo",
    ]) {
      expect(t[id]?.defense_stars, id).toBe(3);
    }
    expect(t.headquarters?.defense_stars).toBe(4);
  });
});

describe("property cardinalities", () => {
  const p = data.properties;

  it("has exactly the five property types", () => {
    expect(Object.keys(p).sort()).toEqual([
      "airport",
      "base",
      "city",
      "headquarters",
      "port",
    ]);
  });

  it("routes production and headquarters defeat correctly", () => {
    expect(p.base?.production.allowed_unit_ids).toHaveLength(11);
    expect(p.airport?.production.allowed_unit_ids).toHaveLength(4);
    expect(p.port?.production.allowed_unit_ids).toHaveLength(4);
    expect(p.city?.production.category).toBe("none");
    expect(p.headquarters?.defeat.triggers_defeat_on_capture).toBe(true);
    expect(p.city?.defeat.triggers_defeat_on_capture).toBe(false);
  });
});

describe("parsers reject malformed input", () => {
  it("throws GameDataError, not a raw ZodError", () => {
    expect(() => parseTerrain({})).toThrow(GameDataError);
    expect(() => parseProperties({})).toThrow(GameDataError);
  });
});
