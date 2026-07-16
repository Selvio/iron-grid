import { describe, expect, it } from "vitest";

import { parseAction, parseActionEnvelope } from "../envelope";
import { InvalidActionError, UnsupportedActionError } from "../errors";

const CONTEXT = {
  matchId: "match-1",
  playerId: "player-1",
  generateUnitId: () => "unit-generated",
};

function base(overrides: Record<string, unknown>): Record<string, unknown> {
  return { expectedStateVersion: 3, idempotencyKey: "key-1", ...overrides };
}

describe("parseActionEnvelope", () => {
  it("accepts a valid envelope", () => {
    expect(
      parseActionEnvelope({ expectedStateVersion: 0, idempotencyKey: "k" }),
    ).toEqual({ expectedStateVersion: 0, idempotencyKey: "k" });
  });

  it("rejects a non-integer or negative version", () => {
    expect(() =>
      parseActionEnvelope({ expectedStateVersion: 1.5, idempotencyKey: "k" }),
    ).toThrow(InvalidActionError);
    expect(() =>
      parseActionEnvelope({ expectedStateVersion: -1, idempotencyKey: "k" }),
    ).toThrow(InvalidActionError);
  });

  it("rejects a missing idempotency key", () => {
    expect(() => parseActionEnvelope({ expectedStateVersion: 0 })).toThrow(
      InvalidActionError,
    );
  });
});

describe("parseAction", () => {
  it("parses move_and_wait and sets server matchId/playerId", () => {
    const action = parseAction(
      base({
        type: "move_and_wait",
        unitId: "u1",
        path: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
      }),
      CONTEXT,
    );
    expect(action).toMatchObject({
      type: "move_and_wait",
      matchId: "match-1",
      playerId: "player-1",
      expectedStateVersion: 3,
      idempotencyKey: "key-1",
      unitId: "u1",
    });
  });

  it("parses attack with an optional path omitted", () => {
    const action = parseAction(
      base({ type: "attack", unitId: "u1", targetUnitId: "u2" }),
      CONTEXT,
    );
    expect(action).toMatchObject({ type: "attack", targetUnitId: "u2" });
  });

  it("server-assigns produce's newUnitId (never from the client)", () => {
    const action = parseAction(
      base({
        type: "produce",
        propertyId: "hq1",
        unitTypeId: "tank",
        newUnitId: "client-supplied-should-be-ignored",
      }),
      CONTEXT,
    );
    expect(action).toMatchObject({
      type: "produce",
      newUnitId: "unit-generated",
    });
  });

  it("parses unload with cargo targets", () => {
    const action = parseAction(
      base({
        type: "unload",
        unitId: "t1",
        unloads: [{ cargoUnitId: "c1", to: { x: 2, y: 3 } }],
      }),
      CONTEXT,
    );
    expect(action).toMatchObject({
      type: "unload",
      unloads: [{ cargoUnitId: "c1", to: { x: 2, y: 3 } }],
    });
  });

  it("parses envelope-only actions (end_turn, resign)", () => {
    expect(parseAction(base({ type: "end_turn" }), CONTEXT).type).toBe(
      "end_turn",
    );
    expect(parseAction(base({ type: "resign" }), CONTEXT).type).toBe("resign");
  });

  it("rejects a malformed payload", () => {
    expect(() =>
      parseAction(base({ type: "move_and_wait", unitId: "u1" }), CONTEXT),
    ).toThrow(InvalidActionError);
    expect(() =>
      parseAction(
        base({ type: "move_and_wait", unitId: "u1", path: [] }),
        CONTEXT,
      ),
    ).toThrow(InvalidActionError);
    expect(() =>
      parseAction(
        base({ type: "move_and_wait", unitId: "u1", path: [{ x: 0.5, y: 0 }] }),
        CONTEXT,
      ),
    ).toThrow(InvalidActionError);
  });

  it("rejects the gated activate_power type", () => {
    expect(() =>
      parseAction(base({ type: "activate_power" }), CONTEXT),
    ).toThrow(UnsupportedActionError);
  });

  it("rejects not-yet-supported types (claim_victory / launch_missile)", () => {
    for (const type of ["claim_victory", "launch_missile"]) {
      expect(() => parseAction(base({ type }), CONTEXT)).toThrow(
        UnsupportedActionError,
      );
    }
  });

  it("rejects an unknown action type", () => {
    expect(() => parseAction(base({ type: "teleport" }), CONTEXT)).toThrow(
      InvalidActionError,
    );
  });
});
