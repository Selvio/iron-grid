import { describe, expect, it } from "vitest";

import type { MatchView } from "@/app/lib/api-client";
import { buildPropertyRenderModel } from "../property-map";

function view(properties: unknown[], units: unknown[] = []): MatchView {
  return {
    you: { playerId: "me", factionId: "blue" },
    opponent: { playerId: "them", factionId: "red" },
    properties,
    units,
  } as unknown as MatchView;
}

describe("buildPropertyRenderModel", () => {
  it("resolves owner faction, tile and neutral state", () => {
    const model = buildPropertyRenderModel(
      view([
        {
          id: "hq1",
          typeId: "headquarters",
          position: { x: 1, y: 2 },
          ownerPlayerId: "me",
          capturePointsRemaining: 20,
        },
        {
          id: "c1",
          typeId: "city",
          position: { x: 3, y: 4 },
          ownerPlayerId: null,
          capturePointsRemaining: 20,
        },
      ]),
    );
    expect(model[0]).toMatchObject({
      propertyId: "hq1",
      x: 1,
      y: 2,
      ownerFaction: "blue",
      captureProgress: 0,
    });
    expect(model[0].renderTileId).toBe("terrain_r14_c03");
    expect(model[1].ownerFaction).toBeNull();
  });

  it("reports capture progress as a fraction of the 20 points", () => {
    const [property] = buildPropertyRenderModel(
      view([
        {
          id: "c1",
          typeId: "city",
          position: { x: 0, y: 0 },
          ownerPlayerId: "them",
          capturePointsRemaining: 5, // 15 of 20 captured
          capturingUnitId: null,
        },
      ]),
    );
    expect(property.ownerFaction).toBe("red");
    expect(property.captureProgress).toBeCloseTo(0.75);
    expect(property.capturingFaction).toBeNull();
  });

  it("resolves capturingFaction while ownership is still neutral", () => {
    const [property] = buildPropertyRenderModel(
      view(
        [
          {
            id: "c1",
            typeId: "city",
            position: { x: 0, y: 0 },
            ownerPlayerId: null,
            capturePointsRemaining: 10,
            capturingUnitId: "inf1",
          },
        ],
        [{ id: "inf1", ownerPlayerId: "me", position: { x: 0, y: 0 } }],
      ),
    );
    expect(property.ownerFaction).toBeNull();
    expect(property.capturingFaction).toBe("blue");
    expect(property.captureProgress).toBeCloseTo(0.5);
  });
});
