import { afterEach, describe, expect, it, vi } from "vitest";

import type { PlayerEvent } from "@/app/lib/api-client";
import {
  buildAnimationPlan,
  prefersReducedMotion,
  submittedAttackPlan,
  submittedMovePlan,
} from "../animation-plan";

function ev(sequence: number, type: string, payload: unknown): PlayerEvent {
  return { sequence, type, payload };
}

describe("buildAnimationPlan", () => {
  it("maps a move event to a path tween", () => {
    const plan = buildAnimationPlan(
      [
        ev(1, "unit_moved", {
          unitId: "u1",
          path: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
          ],
        }),
      ],
      { reducedMotion: false },
    );
    expect(plan).toEqual([
      {
        kind: "move",
        unitId: "u1",
        path: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
      },
    ]);
  });

  it("maps an attack to a strike with damage + hp-after", () => {
    const [step] = buildAnimationPlan(
      [
        ev(1, "unit_attacked", {
          attackerUnitId: "a",
          defenderUnitId: "d",
          damage: 40,
          defenderHpAfter: 60,
        }),
      ],
      { reducedMotion: false },
    );
    expect(step).toEqual({
      kind: "attack",
      attackerUnitId: "a",
      defenderUnitId: "d",
      damage: 40,
      defenderHpAfter: 60,
    });
  });

  it("falls back to an effect overlay for frameless events (§28.3)", () => {
    const plan = buildAnimationPlan(
      [
        ev(1, "property_captured", { propertyId: "p1" }),
        ev(2, "unit_repaired", { unitId: "u1" }),
      ],
      { reducedMotion: false },
    );
    expect(plan).toEqual([
      { kind: "effect", label: "capture" },
      { kind: "effect", label: "repair" },
    ]);
  });

  it("orders steps by sequence and drops non-visual events", () => {
    const plan = buildAnimationPlan(
      [
        ev(3, "unit_destroyed", { unitId: "d" }),
        ev(1, "unit_moved", { unitId: "u1", path: [] }),
        ev(2, "income_granted", { amount: 1000 }), // no visual
      ],
      { reducedMotion: false },
    );
    expect(plan.map((s) => s.kind)).toEqual(["move", "destroy"]);
  });

  it("collapses to nothing when reduced motion is preferred", () => {
    expect(
      buildAnimationPlan([ev(1, "unit_moved", { unitId: "u1", path: [] })], {
        reducedMotion: true,
      }),
    ).toEqual([]);
  });
});

describe("submittedMovePlan", () => {
  const path = [
    { x: 2, y: 1 },
    { x: 3, y: 1 },
  ];

  it("builds a single move step from the submitted path", () => {
    expect(submittedMovePlan("u1", path, { reducedMotion: false })).toEqual([
      { kind: "move", unitId: "u1", path },
    ]);
  });

  it("is empty under reduced motion (snap, no walk)", () => {
    expect(submittedMovePlan("u1", path, { reducedMotion: true })).toEqual([]);
  });
});

describe("submittedAttackPlan", () => {
  const path = [
    { x: 2, y: 1 },
    { x: 3, y: 1 },
  ];

  it("walks to the firing tile, then strikes the defender", () => {
    expect(
      submittedAttackPlan("u1", path, "e1", { reducedMotion: false }),
    ).toEqual([
      { kind: "move", unitId: "u1", path },
      {
        kind: "attack",
        attackerUnitId: "u1",
        defenderUnitId: "e1",
        damage: 0,
        defenderHpAfter: 0,
      },
    ]);
  });

  it("omits the walk for an attack in place (single-tile path)", () => {
    expect(
      submittedAttackPlan("u1", [{ x: 2, y: 1 }], "e1", {
        reducedMotion: false,
      }),
    ).toEqual([
      {
        kind: "attack",
        attackerUnitId: "u1",
        defenderUnitId: "e1",
        damage: 0,
        defenderHpAfter: 0,
      },
    ]);
  });

  it("is empty under reduced motion", () => {
    expect(
      submittedAttackPlan("u1", path, "e1", { reducedMotion: true }),
    ).toEqual([]);
  });
});

describe("prefersReducedMotion", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reflects the OS media query", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("reduce"),
    }));
    expect(prefersReducedMotion()).toBe(true);
  });

  it("is false when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(prefersReducedMotion()).toBe(false);
  });
});
