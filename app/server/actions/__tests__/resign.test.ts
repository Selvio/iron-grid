import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { events } from "../../db/schema/events";
import { matches } from "../../db/schema/matches";
import { fixtureGameData } from "../../lifecycle/__tests__/fixtures";
import { createInvitationRateLimiter } from "../../lifecycle/rate-limit";
import { handleSubmitAction } from "../submit";
import {
  activateFixtureMatch,
  sessionFor,
  type ActiveMatch,
} from "./active-match";

function request(body: unknown): Request {
  return new Request("https://iron-grid.test/api/matches/m/actions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("resign action", () => {
  let active: ActiveMatch;

  beforeEach(async () => {
    active = await activateFixtureMatch();
  });

  afterEach(async () => {
    await active.handle.close();
  });

  function deps(userId: string) {
    return {
      db: active.handle.db,
      gameData: fixtureGameData(),
      resolveSession: sessionFor(userId),
      rateLimiter: createInvitationRateLimiter(1000),
      now: () => new Date("2026-07-16T12:00:00.000Z"),
    };
  }

  it("completes the match in the opponent's favour", async () => {
    const response = await handleSubmitAction(
      request({
        type: "resign",
        expectedStateVersion: 0,
        idempotencyKey: "r1",
      }),
      active.matchId,
      deps(active.hostId),
    );
    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      completed: boolean;
      winnerPlayerId: string;
      completionReason: string;
    };
    expect(result.completed).toBe(true);
    expect(result.winnerPlayerId).toBe(active.guestPlayerId);
    expect(result.completionReason).toBe("resignation");

    const [match] = await active.handle.db
      .select()
      .from(matches)
      .where(eq(matches.id, active.matchId));
    expect(match.status).toBe("completed");
    expect(match.winnerPlayerId).toBe(active.guestPlayerId);
    expect(match.completionReason).toBe("resignation");
    expect(match.completedAt).toBeInstanceOf(Date);
    expect(match.turnDeadlineAt).toBeNull();

    const log = await active.handle.db
      .select()
      .from(events)
      .where(eq(events.matchId, active.matchId));
    expect(log.some((e) => e.type === "player_resigned")).toBe(true);
    expect(log.some((e) => e.type === "match_completed")).toBe(true);
  });

  it("makes the completed match gameplay-immutable", async () => {
    await handleSubmitAction(
      request({
        type: "resign",
        expectedStateVersion: 0,
        idempotencyKey: "r1",
      }),
      active.matchId,
      deps(active.hostId),
    );

    // The guest (now the winner) cannot act on the finished match.
    const after = await handleSubmitAction(
      request({
        type: "end_turn",
        expectedStateVersion: 1,
        idempotencyKey: "e1",
      }),
      active.matchId,
      deps(active.guestId),
    );
    expect(after.status).toBe(409);
    expect((await after.json()).error).toBe("match_already_completed");
  });
});
