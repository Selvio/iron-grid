import type { MatchState } from "game-engine";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  assertStateVersion,
  incrementStateVersion,
  lockMatchForUpdate,
  StateVersionConflictError,
} from "../queries/concurrency";
import { persistMatchSnapshot } from "../queries/matches";
import { createTestDb, type TestDb } from "./harness";
import { insertDraftMatch } from "./fixtures";

function makeState(stateVersion: number): MatchState {
  return {
    match: {
      id: "match-1",
      status: "active",
      dataVersion: "test-v1",
      mapId: "map-1",
      stateVersion,
      currentDay: 1,
      activePlayerId: "player-1",
      firstPlayerId: "player-1",
      startedAt: "2026-07-14T00:00:00.000Z",
      completedAt: null,
      winnerPlayerId: null,
      completionReason: null,
      turnDeadlineAt: null,
      expiredTurnClaimAvailableTo: null,
      deterministicSeed: "seed",
      randomSequenceIndex: 0,
    },
    players: [],
    units: [],
    properties: [],
    terrainObjects: [],
  };
}

describe("optimistic concurrency primitives", () => {
  let handle: TestDb;

  beforeEach(async () => {
    handle = await createTestDb();
    await handle.applyMigrations();
    await insertDraftMatch(handle);
  });

  afterEach(async () => {
    await handle.close();
  });

  it("locks and reads an existing match, null for a missing one", async () => {
    expect(await lockMatchForUpdate(handle.db, "match-1")).toEqual({
      id: "match-1",
      stateVersion: 0,
    });
    expect(await lockMatchForUpdate(handle.db, "ghost")).toBeNull();
  });

  it("accepts a matching version and rejects a stale one", () => {
    expect(() => assertStateVersion(4, 4)).not.toThrow();
    try {
      assertStateVersion(5, 4);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(StateVersionConflictError);
      expect((error as StateVersionConflictError).currentStateVersion).toBe(5);
      expect((error as StateVersionConflictError).code).toBe(
        "stale_state_version",
      );
    }
  });

  it("increments the version by exactly one", async () => {
    await persistMatchSnapshot(handle.db, "match-1", makeState(7));

    const next = await incrementStateVersion(handle.db, "match-1");
    expect(next).toBe(8);
    expect(await lockMatchForUpdate(handle.db, "match-1")).toEqual({
      id: "match-1",
      stateVersion: 8,
    });
  });
});
