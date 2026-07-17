import { describe, expect, it } from "vitest";

import { INITIAL_INTERACTION, interactionReducer } from "../machine";

describe("interactionReducer", () => {
  it("starts idle", () => {
    expect(INITIAL_INTERACTION).toEqual({ kind: "idle" });
  });

  it("selects a unit with its reachable set", () => {
    const next = interactionReducer(INITIAL_INTERACTION, {
      type: "select",
      unitId: "u1",
      reachable: [{ x: 1, y: 1 }],
    });
    expect(next).toEqual({
      kind: "unit-selected",
      unitId: "u1",
      reachable: [{ x: 1, y: 1 }],
    });
  });

  it("returns to idle on deselect", () => {
    const selected = interactionReducer(INITIAL_INTERACTION, {
      type: "select",
      unitId: "u1",
      reachable: [],
    });
    expect(interactionReducer(selected, { type: "deselect" })).toEqual({
      kind: "idle",
    });
  });
});
