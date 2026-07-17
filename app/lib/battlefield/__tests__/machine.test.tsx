import type { CombatPreview } from "game-engine";
import { describe, expect, it } from "vitest";

import {
  INITIAL_INTERACTION,
  interactionReducer,
  type InteractionState,
} from "../machine";

const PREVIEW: CombatPreview = {
  attackerUnitId: "u1",
  defenderUnitId: "e1",
  minDamage: 4,
  maxDamage: 6,
};

function selected(): InteractionState {
  return interactionReducer(INITIAL_INTERACTION, {
    type: "select",
    unitId: "u1",
    reachable: [{ x: 1, y: 1 }],
  });
}

describe("interactionReducer", () => {
  it("starts idle and selects a unit with its reachable set", () => {
    expect(INITIAL_INTERACTION).toEqual({ kind: "idle" });
    expect(selected()).toMatchObject({ kind: "unit-selected", unitId: "u1" });
  });

  it("walks select → destination → combat-preview", () => {
    const dest = interactionReducer(selected(), {
      type: "choose-destination",
      destination: { x: 1, y: 1 },
      actions: ["move_and_wait", "attack"],
    });
    expect(dest).toMatchObject({
      kind: "destination",
      destination: { x: 1, y: 1 },
      actions: ["move_and_wait", "attack"],
    });

    const combat = interactionReducer(dest, {
      type: "choose-target",
      targetUnitId: "e1",
      preview: PREVIEW,
    });
    expect(combat).toMatchObject({
      kind: "combat-preview",
      targetUnitId: "e1",
      preview: PREVIEW,
    });
  });

  it("cancels back one step, restoring the prior state", () => {
    const dest = interactionReducer(selected(), {
      type: "choose-destination",
      destination: { x: 1, y: 1 },
      actions: ["attack"],
    });
    const combat = interactionReducer(dest, {
      type: "choose-target",
      targetUnitId: "e1",
      preview: PREVIEW,
    });
    // combat → destination (menu restored)
    expect(interactionReducer(combat, { type: "cancel" })).toMatchObject({
      kind: "destination",
      actions: ["attack"],
    });
    // destination → unit-selected (range restored)
    expect(interactionReducer(dest, { type: "cancel" })).toMatchObject({
      kind: "unit-selected",
      reachable: [{ x: 1, y: 1 }],
    });
  });

  it("ignores out-of-order events and returns to idle on deselect", () => {
    // choose-destination is a no-op from idle.
    expect(
      interactionReducer(INITIAL_INTERACTION, {
        type: "choose-destination",
        destination: { x: 0, y: 0 },
        actions: [],
      }),
    ).toEqual(INITIAL_INTERACTION);
    expect(interactionReducer(selected(), { type: "deselect" })).toEqual({
      kind: "idle",
    });
  });
});
