import { describe, expect, it } from "vitest";

import type { ResignAction } from "./actions";
import type { GameData } from "game-data";
import { applyResign } from "./resign";
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

const resign = (playerId: string): ResignAction => ({
  type: "resign",
  matchId: "m1",
  playerId,
  expectedStateVersion: 1,
  idempotencyKey: "k",
});

const EMPTY_GAME_DATA = {} as unknown as GameData;

describe("resign", () => {
  it("completes the match in the opponent's favour with reason resignation", () => {
    const { nextState, events } = applyResign(state(), resign("p1"));

    expect(nextState.match.status).toBe("completed");
    expect(nextState.match.winnerPlayerId).toBe("p2");
    expect(nextState.match.completionReason).toBe("resignation");
    expect(nextState.players.find((p) => p.playerId === "p1")?.resigned).toBe(
      true,
    );
    expect(events.map((e) => e.type)).toEqual([
      "player_resigned",
      "match_completed",
    ]);
  });

  it("is legal for the active player of an active match", () => {
    expect(validateAction(state(), resign("p1"), EMPTY_GAME_DATA)).toEqual({
      valid: true,
    });
  });

  it("is rejected for the non-active player", () => {
    const result = validateAction(state(), resign("p2"), EMPTY_GAME_DATA);
    expect(result.valid).toBe(false);
  });

  it("is rejected once the match is no longer active", () => {
    const result = validateAction(
      state({ status: "completed" }),
      resign("p1"),
      EMPTY_GAME_DATA,
    );
    expect(result.valid).toBe(false);
  });
});
