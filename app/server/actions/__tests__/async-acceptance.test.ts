import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { matches } from "../../db/schema/matches";
import { fixtureGameData } from "../../lifecycle/__tests__/fixtures";
import { createInvitationRateLimiter } from "../../lifecycle/rate-limit";
import { handleGetMatch } from "../read";
import { handleSubmitAction } from "../submit";
import {
  activateFixtureMatch,
  sessionFor,
  type ActiveMatch,
} from "./active-match";

/**
 * M8-T7 — async acceptance (spec §35 #25, `required_validation_tests.asynchronous`).
 *
 * The claim-eligibility / revoke / race scenarios are proven in
 * `claim-victory.test.ts`; this consolidates the "expired turn does not auto-end"
 * guarantee end-to-end: after the deadline the match stays active until the
 * inactive opponent explicitly claims it.
 */
const AFTER_DEADLINE = new Date("2026-07-18T12:00:00.000Z");

function request(body: unknown): Request {
  return new Request("https://iron-grid.test/api/matches/m/actions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("async model acceptance", () => {
  let active: ActiveMatch;

  beforeEach(async () => {
    active = await activateFixtureMatch();
  });

  afterEach(async () => {
    await active.handle.close();
  });

  it("does not auto-end an expired turn — only a claim ends the match", async () => {
    // No sweeper acts on the passed deadline; the match is still active.
    const read = await handleGetMatch(active.matchId, {
      db: active.handle.db,
      gameData: fixtureGameData(),
      resolveSession: sessionFor(active.hostId),
    });
    expect((await read.json()).status).toBe("active");
    const [beforeClaim] = await active.handle.db
      .select()
      .from(matches)
      .where(eq(matches.id, active.matchId));
    expect(beforeClaim.status).toBe("active");
    expect(beforeClaim.activePlayerId).toBe(active.hostPlayerId);

    // Only an explicit claim by the inactive opponent completes it.
    const claim = await handleSubmitAction(
      request({
        type: "claim_victory",
        expectedStateVersion: 0,
        idempotencyKey: "c1",
      }),
      active.matchId,
      {
        db: active.handle.db,
        gameData: fixtureGameData(),
        resolveSession: sessionFor(active.guestId),
        rateLimiter: createInvitationRateLimiter(1000),
        now: () => AFTER_DEADLINE,
      },
    );
    expect(claim.status).toBe(200);
    const [afterClaim] = await active.handle.db
      .select()
      .from(matches)
      .where(eq(matches.id, active.matchId));
    expect(afterClaim.status).toBe("completed");
    expect(afterClaim.winnerPlayerId).toBe(active.guestPlayerId);
  });
});
