import { describe, expect, it } from "vitest";

import {
  commanderSelectSchema,
  createMatchSchema,
  joinMatchSchema,
} from "../schemas";

describe("createMatchSchema", () => {
  it("accepts a valid configuration, including a null day limit", () => {
    expect(
      createMatchSchema.safeParse({
        mapId: "map-1",
        turnDeadline: "3d",
        dayLimit: null,
      }).success,
    ).toBe(true);
  });

  it("rejects an empty map, a bad deadline and a non-positive day limit", () => {
    expect(
      createMatchSchema.safeParse({
        mapId: "",
        turnDeadline: "3d",
        dayLimit: null,
      }).success,
    ).toBe(false);
    expect(
      createMatchSchema.safeParse({
        mapId: "map-1",
        turnDeadline: "2h",
        dayLimit: null,
      }).success,
    ).toBe(false);
    expect(
      createMatchSchema.safeParse({
        mapId: "map-1",
        turnDeadline: "3d",
        dayLimit: 0,
      }).success,
    ).toBe(false);
  });
});

describe("joinMatchSchema", () => {
  it("accepts six alphanumerics and rejects the wrong length", () => {
    expect(joinMatchSchema.safeParse({ code: "ABC123" }).success).toBe(true);
    expect(joinMatchSchema.safeParse({ code: "ABC12" }).success).toBe(false);
    expect(joinMatchSchema.safeParse({ code: "" }).success).toBe(false);
  });
});

describe("commanderSelectSchema", () => {
  it("requires a commander id", () => {
    expect(
      commanderSelectSchema.safeParse({ commanderId: "commander_blue" })
        .success,
    ).toBe(true);
    expect(commanderSelectSchema.safeParse({ commanderId: "" }).success).toBe(
      false,
    );
  });
});
