import { describe, expect, it } from "vitest";

import { loadGameData } from "./index";
import { DATA_FILES } from "./game-data";

/**
 * M1-T1 acceptance: the loader reads the eight canonical files and stamps the
 * shared version. Exhaustive per-check negative fixtures land in M1-T6.
 *
 * @see docs/04-development/milestones/m1-game-data.md (M1-T1)
 */
describe("loadGameData (M1-T1 scaffold)", () => {
  const data = loadGameData();

  it("stamps the shared schema version", () => {
    expect(data.version).toBe("1.0.0");
  });

  it("surfaces every canonical file as a parsed mapping", () => {
    const payloads = {
      units: data.units,
      weapons: data.weapons,
      "damage-chart": data.damageChart,
      terrain: data.terrain,
      properties: data.properties,
      commanders: data.commanders,
      maps: data.maps,
      rules: data.rules,
    };
    // One payload per canonical file, each a non-null object.
    expect(Object.keys(payloads)).toHaveLength(DATA_FILES.length);
    for (const [name, payload] of Object.entries(payloads)) {
      expect(payload, name).toBeTypeOf("object");
      expect(payload, name).not.toBeNull();
    }
  });
});
