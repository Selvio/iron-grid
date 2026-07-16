import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { matches } from "../../db/schema/matches";
import { fixtureGameData } from "../../lifecycle/__tests__/fixtures";
import { createInvitationRateLimiter } from "../../lifecycle/rate-limit";
import { handleSubmitAction } from "../submit";
import {
  activateFixtureMatch,
  sessionFor,
  type ActiveMatch,
} from "./active-match";

const NOW = new Date("2026-07-16T12:00:00.000Z");

function endTurnRequest(expectedStateVersion: number, key: string): Request {
  return new Request("https://iron-grid.test/api/matches/m/actions", {
    method: "POST",
    body: JSON.stringify({
      type: "end_turn",
      expectedStateVersion,
      idempotencyKey: key,
    }),
  });
}

describe("end_turn hand-off", () => {
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
      now: () => NOW,
    };
  }

  async function matchRow() {
    const [row] = await active.handle.db
      .select()
      .from(matches)
      .where(eq(matches.id, active.matchId));
    return row;
  }

  it("flips the active player and stamps the next turn deadline", async () => {
    await handleSubmitAction(
      endTurnRequest(0, "t1"),
      active.matchId,
      deps(active.hostId),
    );

    const row = await matchRow();
    expect(row.activePlayerId).toBe(active.guestPlayerId);
    // 24h setting → deadline stamped at now + 24h.
    expect(row.turnDeadlineAt).toEqual(
      new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
    );
  });

  it("advances the day only when the day's second player ends", async () => {
    const before = await matchRow();
    expect(before.dayCounter).toBe(1);

    // Host (first player) ends → guest's turn, still day 1.
    await handleSubmitAction(
      endTurnRequest(0, "t1"),
      active.matchId,
      deps(active.hostId),
    );
    expect((await matchRow()).dayCounter).toBe(1);

    // Guest (second player) ends → back to host, day advances to 2.
    await handleSubmitAction(
      endTurnRequest(1, "t2"),
      active.matchId,
      deps(active.guestId),
    );
    const after = await matchRow();
    expect(after.dayCounter).toBe(2);
    expect(after.activePlayerId).toBe(active.hostPlayerId);
  });
});
