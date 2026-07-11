import { describe, expect, it } from "vitest";

import { GAME_DATA_PACKAGE } from "./index";

/** Smoke test proving the Vitest harness reaches this package (M0-T4). */
describe("game-data package", () => {
  it("exports its package identifier", () => {
    expect(GAME_DATA_PACKAGE).toBe("game-data");
  });
});
