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
  supplyDestinations: [],
  joinDestinations: [],
  loadDestinations: [],
  unloadDestinations: [],
  diveDestinations: [],
  surfaceDestinations: [],
};

/** A full DestinationOptions with everything off, overridden by `p`. */
function opts(p: Partial<DestinationOptions> = {}): DestinationOptions {
  return {
    canWait: false,
    canCapture: false,
    attackTargets: [],
    canSupply: false,
    canJoin: false,
    canLoad: false,
    canUnload: false,
    canDive: false,
    canSurface: false,
    ...p,
  };
}

const WAIT_ONLY: DestinationOptions = opts({ canWait: true });
const ATTACKABLE: DestinationOptions = opts({
  canWait: true,
  attackTargets: ["e1", "e2"],
});

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

  it("opens the production menu from idle and cancels back", () => {
    const property = { id: "b1", position: { x: 2, y: 3 } };
    const options = [
      {
        unitTypeId: "infantry",
        displayName: "Infantry",
        cost: 1000,
        affordable: true,
        sprite: null,
      },
    ];
    const menu = interactionReducer(INITIAL_INTERACTION, {
      type: "open-production",
      property,
      options,
    });
    expect(menu).toMatchObject({ kind: "production-menu", property, options });
    // cancel and deselect both return to idle.
    expect(interactionReducer(menu, { type: "cancel" })).toEqual(
      INITIAL_INTERACTION,
    );
    expect(interactionReducer(menu, { type: "deselect" })).toEqual(
      INITIAL_INTERACTION,
    );
  });

  it("does not open the production menu when a unit is already selected", () => {
    const s = selected();
    expect(
      interactionReducer(s, {
        type: "open-production",
        property: { id: "b1", position: { x: 0, y: 0 } },
        options: [],
      }),
    ).toBe(s);
  });

  it("walks the unload flow: menu → cargo picker → drop → cancel back", () => {
    const menu = menuAt({ x: 2, y: 1 }, opts({ canUnload: true }));
    const cargo = [
      { unitId: "inf1", displayName: "Infantry", sprite: null },
      { unitId: "mech1", displayName: "Mech", sprite: null },
    ];
    const picker = interactionReducer(menu, { type: "open-unload", cargo });
    expect(picker).toMatchObject({ kind: "unload-cargo", cargo });

    const drop = interactionReducer(picker, {
      type: "choose-cargo",
      cargoUnitId: "mech1",
      dropTiles: [{ x: 3, y: 1 }],
    });
    expect(drop).toMatchObject({
      kind: "unload-drop",
      cargoUnitId: "mech1",
      dropTiles: [{ x: 3, y: 1 }],
    });
    // cancel steps drop → action-menu (not all the way out).
    expect(interactionReducer(drop, { type: "cancel" })).toMatchObject({
      kind: "action-menu",
    });
  });

  it("allows a direct menu → drop jump for a single cargo unit", () => {
    const menu = menuAt({ x: 2, y: 1 }, opts({ canUnload: true }));
    const drop = interactionReducer(menu, {
      type: "choose-cargo",
      cargoUnitId: "inf1",
      dropTiles: [{ x: 3, y: 1 }],
    });
    expect(drop).toMatchObject({ kind: "unload-drop", cargoUnitId: "inf1" });
  });
});
