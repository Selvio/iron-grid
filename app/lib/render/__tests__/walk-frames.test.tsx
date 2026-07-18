import { describe, expect, it } from "vitest";

import { stepDirection, walkFrameSpec } from "../walk-frames";

describe("stepDirection", () => {
  it("reads the four orthogonal headings", () => {
    expect(stepDirection({ x: 1, y: 1 }, { x: 2, y: 1 })).toBe("right");
    expect(stepDirection({ x: 1, y: 1 }, { x: 0, y: 1 })).toBe("left");
    expect(stepDirection({ x: 1, y: 1 }, { x: 1, y: 2 })).toBe("down");
    expect(stepDirection({ x: 1, y: 1 }, { x: 1, y: 0 })).toBe("up");
  });

  it("breaks a diagonal tie toward the horizontal", () => {
    expect(stepDirection({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe("right");
    expect(stepDirection({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe("left");
  });
});

describe("walkFrameSpec", () => {
  it("uses move_side (flipped for left) and move_down/up", () => {
    expect(walkFrameSpec("left")).toEqual({
      animation: "move_side",
      flipX: true,
    });
    expect(walkFrameSpec("right")).toEqual({
      animation: "move_side",
      flipX: false,
    });
    expect(walkFrameSpec("down")).toEqual({
      animation: "move_down",
      flipX: false,
    });
    expect(walkFrameSpec("up")).toEqual({ animation: "move_up", flipX: false });
  });
});
