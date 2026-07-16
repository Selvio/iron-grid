import { describe, expect, it } from "vitest";

import type { ClaimVictoryAction } from "./actions";
import { applyClaimVictory } from "./claim-victory";
import type { GameData } from "game-data";
import type { MatchMeta, MatchState, PlayerState } from "./state";
import { validateAction } from "./validate";

function player(playerId: string): PlayerState {
  return {
    playerId,
    userId: `u_${playerId}`,
    factionId: "blue",
    commanderId: "cmdr",
    funds: 0,
    powerMeter: 0,
    ready: true,
    resigned: false,
  };
}

function meta(overrides: Partial<MatchMeta> = {}): MatchMeta {
  return {
    id: "m1",
    status: "active",
    dataVersion: "1.0.0",
    mapId: "map",
    stateVersion: 1,
    currentDay: 1,
    activePlayerId: "p1",
    firstPlayerId: "p1",
    startedAt: null,
    completedAt: null,
    winnerPlayerId: null,
    completionReason: null,
    turnDeadlineAt: null,
    expiredTurnClaimAvailableTo: null,
    deterministicSeed: "seed",
    randomSequenceIndex: 0,
    ...overrides,
  };
}

function state(overrides: Partial<MatchMeta> = {}): MatchState {
  return {
    match: meta(overrides),
    players: [player("p1"), player("p2")],
    units: [],
    properties: [],
    terrainObjects: [],
  };
}

// p1 is the active (timed-out) player; p2 is the inactive claimant.
const claim = (playerId: string): ClaimVictoryAction => ({
  type: "claim_victory",
  matchId: "m1",
  playerId,
  expectedStateVersion: 1,
  idempotencyKey: "k",
});

const EMPTY_GAME_DATA = {} as unknown as GameData;

describe("claim_victory", () => {
  it("completes the match to the claimant with reason timeout_claimed", () => {
    const { nextState, events } = applyClaimVictory(state(), claim("p2"));

    expect(nextState.match.status).toBe("completed");
    expect(nextState.match.winnerPlayerId).toBe("p2");
    expect(nextState.match.completionReason).toBe("timeout_claimed");
    expect(events.map((e) => e.type)).toEqual([
      "victory_claimed",
      "match_completed",
    ]);
    const claimed = events[0];
    expect(claimed).toMatchObject({
      type: "victory_claimed",
      playerId: "p2",
      timedOutPlayerId: "p1",
    });
  });

  it("is legal for the inactive opponent of an active match", () => {
    expect(validateAction(state(), claim("p2"), EMPTY_GAME_DATA)).toEqual({
      valid: true,
    });
  });

  it("rejects the active player claiming their own timeout", () => {
    const result = validateAction(state(), claim("p1"), EMPTY_GAME_DATA);
    expect(result.valid).toBe(false);
  });

  it("rejects a non-member claimant", () => {
    const result = validateAction(state(), claim("ghost"), EMPTY_GAME_DATA);
    expect(result.valid).toBe(false);
  });

  it("rejects a claim once the match is no longer active", () => {
    const result = validateAction(
      state({ status: "completed" }),
      claim("p2"),
      EMPTY_GAME_DATA,
    );
    expect(result.valid).toBe(false);
  });
});
