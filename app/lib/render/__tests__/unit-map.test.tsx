import { describe, expect, it } from "vitest";

import type { MatchView } from "@/app/lib/api-client";
import { buildUnitRenderModel } from "../unit-map";
import { unitFrame } from "../derive-render-data";

function view(units: unknown[], properties: unknown[] = []): MatchView {
  return {
    viewerPlayerId: "me",
    you: { playerId: "me", factionId: "blue" },
    opponent: { playerId: "them", factionId: "red" },
    unitRender: {
      tank: { spriteRow: 9, submergedRow: null, isAir: false },
      fighter: { spriteRow: 25, submergedRow: null, isAir: true },
      submarine: { spriteRow: 40, submergedRow: 39, isAir: false },
    },
    units,
    properties,
  } as unknown as MatchView;
}

const base = {
  hasActed: false,
  specialState: null,
  position: { x: 0, y: 0 },
  trueHp: 100,
};

describe("buildUnitRenderModel", () => {
  it("places an own tank with its faction sheet and idle frame", () => {
    const [sprite] = buildUnitRenderModel(
      view([
        {
          ...base,
          id: "u1",
          typeId: "tank",
          ownerPlayerId: "me",
          position: { x: 2, y: 3 },
        },
      ]),
    );
    expect(sprite).toMatchObject({
      unitId: "u1",
      x: 2,
      y: 3,
      faction: "blue",
      shadow: false,
      greyed: false,
      submerged: false,
    });
    expect(sprite.frame).toEqual(unitFrame(9, "idle", 0));
  });

  it("greys the viewer's own unit once it has acted, but not the enemy's", () => {
    const sprites = buildUnitRenderModel(
      view([
        {
          ...base,
          id: "mine",
          typeId: "tank",
          ownerPlayerId: "me",
          hasActed: true,
        },
        {
          ...base,
          id: "theirs",
          typeId: "tank",
          ownerPlayerId: "them",
          hasActed: true,
        },
      ]),
    );
    expect(sprites.find((s) => s.unitId === "mine")!.greyed).toBe(true);
    expect(sprites.find((s) => s.unitId === "theirs")!.greyed).toBe(false);
  });

  it("gives air units a shadow", () => {
    const [sprite] = buildUnitRenderModel(
      view([{ ...base, id: "f1", typeId: "fighter", ownerPlayerId: "me" }]),
    );
    expect(sprite.shadow).toBe(true);
  });

  it("uses the submerged row for a dived submarine", () => {
    const [sprite] = buildUnitRenderModel(
      view([
        {
          ...base,
          id: "s1",
          typeId: "submarine",
          ownerPlayerId: "them",
          specialState: "submerged",
        },
      ]),
    );
    expect(sprite.submerged).toBe(true);
    expect(sprite.frame).toEqual(unitFrame(39, "idle", 0));
  });

  it("skips cargo units with no position", () => {
    const sprites = buildUnitRenderModel(
      view([
        {
          ...base,
          id: "c1",
          typeId: "tank",
          ownerPlayerId: "me",
          position: null,
        },
      ]),
    );
    expect(sprites).toHaveLength(0);
  });

  it("carries the display HP (0–10) for the on-canvas badge", () => {
    const [full, hurt] = buildUnitRenderModel(
      view([
        { ...base, id: "a", typeId: "tank", ownerPlayerId: "me", trueHp: 100 },
        {
          ...base,
          id: "b",
          typeId: "tank",
          ownerPlayerId: "them",
          position: { x: 1, y: 0 },
          trueHp: 61, // ceil(61/10) = 7 → shown; full stays 10 → hidden
        },
      ]),
    );
    expect(full!.displayHp).toBe(10);
    expect(hurt!.displayHp).toBe(7);
  });

  it("faces each unit toward the opponent's headquarters", () => {
    // Blue HQ on the right (x=9), red HQ on the left (x=0).
    const hqs = [
      { typeId: "headquarters", ownerPlayerId: "me", position: { x: 9, y: 4 } },
      {
        typeId: "headquarters",
        ownerPlayerId: "them",
        position: { x: 0, y: 4 },
      },
    ];
    const sprites = buildUnitRenderModel(
      view(
        [
          { ...base, id: "blue", typeId: "tank", ownerPlayerId: "me" },
          {
            ...base,
            id: "red",
            typeId: "tank",
            ownerPlayerId: "them",
            position: { x: 5, y: 0 },
          },
        ],
        hqs,
      ),
    );
    // Blue's enemy base is to the left → flipped; red's is to the right → not.
    expect(sprites.find((s) => s.unitId === "blue")!.faceLeft).toBe(true);
    expect(sprites.find((s) => s.unitId === "red")!.faceLeft).toBe(false);
  });

  it("does not flip when headquarters are unknown", () => {
    const [sprite] = buildUnitRenderModel(
      view([{ ...base, id: "u", typeId: "tank", ownerPlayerId: "me" }]),
    );
    expect(sprite!.faceLeft).toBe(false);
  });
});
