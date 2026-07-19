import { describe, expect, it } from "vitest";

import type { MatchView } from "@/app/lib/api-client";
import {
  buildingBaseKey,
  buildingFrameCount,
  buildingFrameId,
  buildPropertyRenderModel,
} from "../property-map";

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
    // Ownership is a different sprite, not a tint.
    expect(model[0].renderTileId).toBe("building_headquarters_blue_0");
    expect(model[1].ownerFaction).toBeNull();
    expect(model[1].renderTileId).toBe("building_city_neutral_0");
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

describe("building flag frames", () => {
  it("counts the two atlas frames for an owned building", () => {
    expect(buildingFrameCount("building_city_blue_0")).toBe(2);
    expect(buildingFrameId("building_city_blue_0", 0)).toBe(
      "building_city_blue_0",
    );
    expect(buildingFrameId("building_city_blue_0", 1)).toBe(
      "building_city_blue_1",
    );
    expect(buildingFrameId("building_city_blue_0", 2)).toBe(
      "building_city_blue_0",
    );
  });

  it("leaves unnumbered keys such as the spent silo alone", () => {
    expect(buildingBaseKey("building_silo_spent")).toBe("building_silo_spent");
    expect(buildingFrameCount("building_silo_spent")).toBe(0);
    expect(buildingFrameId("building_silo_spent", 3)).toBe(
      "building_silo_spent",
    );
  });
});
