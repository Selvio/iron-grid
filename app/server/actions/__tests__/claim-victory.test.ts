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

// Activation stamps a 24h deadline from 2026-07-16T12:00Z → 2026-07-17T12:00Z.
const AFTER_DEADLINE = new Date("2026-07-18T12:00:00.000Z");
const BEFORE_DEADLINE = new Date("2026-07-16T18:00:00.000Z");

function request(body: unknown): Request {
  return new Request("https://iron-grid.test/api/matches/m/actions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const claim = (expectedStateVersion = 0, key = "c1") => ({
  type: "claim_victory",
  expectedStateVersion,
  idempotencyKey: key,
});

describe("claim victory endpoint", () => {
  let active: ActiveMatch;

  beforeEach(async () => {
    active = await activateFixtureMatch();
  });

  afterEach(async () => {
    await active.handle.close();
  });

  function deps(userId: string, now: Date) {
    return {
      db: active.handle.db,
      gameData: fixtureGameData(),
      resolveSession: sessionFor(userId),
      rateLimiter: createInvitationRateLimiter(1000),
      now: () => now,
    };
  }

  async function matchRow() {
    const [row] = await active.handle.db
      .select()
      .from(matches)
      .where(eq(matches.id, active.matchId));
    return row;
  }

  it("lets the inactive opponent claim an expired match", async () => {
    // Host is active; the guest is the inactive opponent.
    const response = await handleSubmitAction(
      request(claim()),
      active.matchId,
      deps(active.guestId, AFTER_DEADLINE),
    );
    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      completed: boolean;
      winnerPlayerId: string;
      completionReason: string;
    };
    expect(result.completed).toBe(true);
    expect(result.winnerPlayerId).toBe(active.guestPlayerId);
    expect(result.completionReason).toBe("timeout_claimed");

    const match = await matchRow();
    expect(match.status).toBe("completed");
    expect(match.winnerPlayerId).toBe(active.guestPlayerId);
    expect(match.completionReason).toBe("timeout_claimed");
    expect(match.completedAt).toBeInstanceOf(Date);

    const log = await active.handle.db
      .select()
      .from(events)
      .where(eq(events.matchId, active.matchId));
    expect(log.some((e) => e.type === "victory_claimed")).toBe(true);
    expect(log.some((e) => e.type === "match_completed")).toBe(true);
  });

  it("rejects a claim before the deadline with deadline_not_expired", async () => {
    const response = await handleSubmitAction(
      request(claim()),
      active.matchId,
      deps(active.guestId, BEFORE_DEADLINE),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("deadline_not_expired");

    expect((await matchRow()).status).toBe("active");
  });

  it("rejects the active player claiming their own timeout", async () => {
    const response = await handleSubmitAction(
      request(claim()),
      active.matchId,
      deps(active.hostId, AFTER_DEADLINE),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("victory_claim_unavailable");
  });

  it("is revoked by a late action from the timed-out player", async () => {
    // The host acts after the deadline — a valid late move → revokes the claim.
    const move = await handleSubmitAction(
      request({
        type: "move_and_wait",
        expectedStateVersion: 0,
        idempotencyKey: "late",
        unitId: "u1",
        path: [
          { x: 0, y: 1 },
          { x: 1, y: 1 },
        ],
      }),
      active.matchId,
      deps(active.hostId, AFTER_DEADLINE),
    );
    expect(move.status).toBe(200);

    // The guest's claim (now at version 1) is no longer eligible.
    const response = await handleSubmitAction(
      request(claim(1, "c2")),
      active.matchId,
      deps(active.guestId, AFTER_DEADLINE),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("victory_claim_unavailable");
    expect((await matchRow()).status).toBe("active");
  });

  it("rejects a stale claim version (late-action race)", async () => {
    // The host committed at v0→v1; the claimant's stale v0 claim loses the race.
    await handleSubmitAction(
      request({
        type: "move_and_wait",
        expectedStateVersion: 0,
        idempotencyKey: "race",
        unitId: "u1",
        path: [
          { x: 0, y: 1 },
          { x: 1, y: 1 },
        ],
      }),
      active.matchId,
      deps(active.hostId, AFTER_DEADLINE),
    );
    const response = await handleSubmitAction(
      request(claim(0, "c3")),
      active.matchId,
      deps(active.guestId, AFTER_DEADLINE),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("stale_state_version");
  });

  it("rejects a claim on an already-completed match", async () => {
    await handleSubmitAction(
      request(claim(0, "c1")),
      active.matchId,
      deps(active.guestId, AFTER_DEADLINE),
    );
    const again = await handleSubmitAction(
      request(claim(1, "c2")),
      active.matchId,
      deps(active.guestId, AFTER_DEADLINE),
    );
    expect(again.status).toBe(409);
    expect((await again.json()).error).toBe("match_already_completed");
  });

  it("rejects a non-member with 403 and unauthenticated with 401", async () => {
    expect(
      (
        await handleSubmitAction(
          request(claim()),
          active.matchId,
          deps(active.outsiderId, AFTER_DEADLINE),
        )
      ).status,
    ).toBe(403);

    const unauth = await handleSubmitAction(request(claim()), active.matchId, {
      db: active.handle.db,
      gameData: fixtureGameData(),
      resolveSession: async () => null,
      rateLimiter: createInvitationRateLimiter(1000),
      now: () => AFTER_DEADLINE,
    });
    expect(unauth.status).toBe(401);
  });
});
