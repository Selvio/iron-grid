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

function actionRequest(body: unknown): Request {
  return new Request("https://iron-grid.test/api/matches/m/actions", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("action pipeline (submit)", () => {
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
    };
  }

  /** A valid end_turn from the active player at the given expected version. */
  const endTurn = (expectedStateVersion = 0, key = "k1") => ({
    type: "end_turn",
    expectedStateVersion,
    idempotencyKey: key,
  });

  it("commits a legal action and bumps the state version", async () => {
    const response = await handleSubmitAction(
      actionRequest(endTurn()),
      active.matchId,
      deps(active.hostId),
    );
    expect(response.status).toBe(200);
    const result = (await response.json()) as { stateVersion: number };
    expect(result.stateVersion).toBe(1);

    const [match] = await active.handle.db
      .select()
      .from(matches)
      .where(eq(matches.id, active.matchId));
    expect(match.stateVersion).toBe(1);
    // end_turn handed the turn to the guest.
    expect(match.activePlayerId).toBe(active.guestPlayerId);

    const log = await active.handle.db
      .select()
      .from(events)
      .where(eq(events.matchId, active.matchId));
    expect(log.some((e) => e.type === "turn_started")).toBe(true);
  });

  it("rejects a stale expectedStateVersion with 409 and no state change", async () => {
    const response = await handleSubmitAction(
      actionRequest(endTurn(99)),
      active.matchId,
      deps(active.hostId),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("stale_state_version");

    const [match] = await active.handle.db
      .select()
      .from(matches)
      .where(eq(matches.id, active.matchId));
    expect(match.stateVersion).toBe(0);
    expect(match.activePlayerId).toBe(active.hostPlayerId);
  });

  it("replays a duplicate idempotency key without re-applying", async () => {
    const first = await handleSubmitAction(
      actionRequest(endTurn(0, "dup")),
      active.matchId,
      deps(active.hostId),
    );
    const firstResult = await first.json();

    // Same key again — the host is no longer active, but the replay short-circuits.
    const second = await handleSubmitAction(
      actionRequest(endTurn(0, "dup")),
      active.matchId,
      deps(active.hostId),
    );
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(firstResult);

    // Only one commit happened: still at version 1, one match_started-less turn.
    const [match] = await active.handle.db
      .select()
      .from(matches)
      .where(eq(matches.id, active.matchId));
    expect(match.stateVersion).toBe(1);
  });

  it("rejects a non-active player with 409 not_active_player", async () => {
    const response = await handleSubmitAction(
      actionRequest(endTurn()),
      active.matchId,
      deps(active.guestId),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("not_active_player");
  });

  it("rejects a non-member with 403", async () => {
    const response = await handleSubmitAction(
      actionRequest(endTurn()),
      active.matchId,
      deps(active.outsiderId),
    );
    expect(response.status).toBe(403);
  });

  it("rejects an illegal action with 422 and commits nothing", async () => {
    const response = await handleSubmitAction(
      actionRequest({
        type: "move_and_wait",
        expectedStateVersion: 0,
        idempotencyKey: "bad",
        unitId: "ghost-unit",
        path: [
          { x: 0, y: 1 },
          { x: 1, y: 1 },
        ],
      }),
      active.matchId,
      deps(active.hostId),
    );
    expect(response.status).toBe(422);

    const [match] = await active.handle.db
      .select()
      .from(matches)
      .where(eq(matches.id, active.matchId));
    expect(match.stateVersion).toBe(0);
  });

  it("returns 400 on a malformed body and 401 when unauthenticated", async () => {
    const malformed = await handleSubmitAction(
      actionRequest("not json"),
      active.matchId,
      deps(active.hostId),
    );
    expect(malformed.status).toBe(400);

    const unauth = await handleSubmitAction(
      actionRequest(endTurn()),
      active.matchId,
      {
        db: active.handle.db,
        gameData: fixtureGameData(),
        resolveSession: async () => null,
        rateLimiter: createInvitationRateLimiter(1000),
      },
    );
    expect(unauth.status).toBe(401);
  });
});
