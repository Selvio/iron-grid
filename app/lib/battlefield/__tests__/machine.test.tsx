import type { CombatPreview } from "game-engine";
import { describe, expect, it } from "vitest";

import type { DestinationOptions, UnitMenu } from "@/app/lib/preview/actions";
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

const MENU: UnitMenu = {
  moveDestinations: [
    { x: 1, y: 1 },
    { x: 2, y: 1 },
  ],
  captureDestinations: [{ x: 2, y: 1 }],
  attacks: [{ from: { x: 1, y: 1 }, targetUnitId: "e1" }],
};

const WAIT_ONLY: DestinationOptions = {
  canWait: true,
  canCapture: false,
  attackTargets: [],
};
const ATTACKABLE: DestinationOptions = {
  canWait: true,
  canCapture: false,
  attackTargets: ["e1", "e2"],
};

function selected(): InteractionState {
  return interactionReducer(INITIAL_INTERACTION, {
    type: "select",
    unitId: "u1",
    menu: MENU,
  });
}

function menuAt(
  destination: { x: number; y: number },
  options: DestinationOptions,
): InteractionState {
  return interactionReducer(selected(), {
    type: "choose-destination",
    destination,
    options,
  });
}

describe("interactionReducer", () => {
  it("starts idle and selects a unit with its action menu", () => {
    expect(INITIAL_INTERACTION).toEqual({ kind: "idle" });
    expect(selected()).toMatchObject({
      kind: "unit-selected",
      unitId: "u1",
      menu: MENU,
    });
  });

  it("walks select → action-menu → select-target → combat-preview", () => {
    const menu = menuAt({ x: 1, y: 1 }, ATTACKABLE);
    expect(menu).toMatchObject({
      kind: "action-menu",
      destination: { x: 1, y: 1 },
    });

    const picker = interactionReducer(menu, { type: "begin-attack" });
    expect(picker).toMatchObject({
      kind: "select-target",
      targets: ["e1", "e2"],
    });

    const combat = interactionReducer(picker, {
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

  it("allows a direct action-menu → combat-preview jump (single target)", () => {
    const menu = menuAt({ x: 1, y: 1 }, ATTACKABLE);
    const combat = interactionReducer(menu, {
      type: "choose-target",
      targetUnitId: "e1",
      preview: PREVIEW,
    });
    expect(combat).toMatchObject({
      kind: "combat-preview",
      targetUnitId: "e1",
    });
  });

  it("does not begin an attack when no targets are available", () => {
    const menu = menuAt({ x: 2, y: 1 }, WAIT_ONLY);
    expect(interactionReducer(menu, { type: "begin-attack" })).toBe(menu);
  });

  it("cancels back one step through the whole chain", () => {
    const menu = menuAt({ x: 1, y: 1 }, ATTACKABLE);
    const picker = interactionReducer(menu, { type: "begin-attack" });
    const combat = interactionReducer(picker, {
      type: "choose-target",
      targetUnitId: "e1",
      preview: PREVIEW,
    });

    // combat-preview → action-menu (menu restored)
    expect(interactionReducer(combat, { type: "cancel" })).toMatchObject({
      kind: "action-menu",
      destination: { x: 1, y: 1 },
    });
    // select-target → action-menu
    expect(interactionReducer(picker, { type: "cancel" })).toMatchObject({
      kind: "action-menu",
    });
    // action-menu → unit-selected (menu restored)
    expect(interactionReducer(menu, { type: "cancel" })).toMatchObject({
      kind: "unit-selected",
      menu: MENU,
    });
    // unit-selected → idle
    expect(interactionReducer(selected(), { type: "cancel" })).toEqual(
      INITIAL_INTERACTION,
    );
  });

  it("ignores out-of-order events and returns to idle on deselect", () => {
    // choose-destination is a no-op from idle.
    expect(
      interactionReducer(INITIAL_INTERACTION, {
        type: "choose-destination",
        destination: { x: 0, y: 0 },
        options: WAIT_ONLY,
      }),
    ).toEqual(INITIAL_INTERACTION);
    expect(interactionReducer(selected(), { type: "deselect" })).toEqual({
      kind: "idle",
    });
  });
});
