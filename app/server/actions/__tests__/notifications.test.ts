import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { notificationJobs } from "../../db/schema/notification-jobs";
import { fixtureGameData } from "../../lifecycle/__tests__/fixtures";
import { createInvitationRateLimiter } from "../../lifecycle/rate-limit";
import { handleSubmitAction } from "../submit";
import {
  activateFixtureMatch,
  sessionFor,
  type ActiveMatch,
} from "./active-match";

const NOW = new Date("2026-07-16T13:00:00.000Z");

function request(body: unknown): Request {
  return new Request("https://iron-grid.test/api/matches/m/actions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("notification enqueue on gameplay events", () => {
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

  async function jobsFor(playerId: string) {
    return active.handle.db
      .select()
      .from(notificationJobs)
      .where(
        and(
          eq(notificationJobs.matchId, active.matchId),
          eq(notificationJobs.playerId, playerId),
        ),
      );
  }

  it("schedules the first player's turn jobs at activation", async () => {
    const jobs = await jobsFor(active.hostPlayerId);
    const byType = Object.fromEntries(jobs.map((j) => [j.type, j.status]));
    expect(byType.turn_started).toBe("pending");
    expect(byType.turn_reminder).toBe("pending");
    expect(byType.turn_expired).toBe("pending");
  });

  it("cancels the prior player's turn jobs and schedules the next's on end_turn", async () => {
    await handleSubmitAction(
      request({
        type: "end_turn",
        expectedStateVersion: 0,
        idempotencyKey: "e1",
      }),
      active.matchId,
      deps(active.hostId),
    );

    // The host's reminder/expired are cancelled on hand-off.
    const host = Object.fromEntries(
      (await jobsFor(active.hostPlayerId)).map((j) => [j.type, j.status]),
    );
    expect(host.turn_reminder).toBe("cancelled");
    expect(host.turn_expired).toBe("cancelled");

    // The guest (new active player) gets a fresh set.
    const guest = Object.fromEntries(
      (await jobsFor(active.guestPlayerId)).map((j) => [j.type, j.status]),
    );
    expect(guest.turn_started).toBe("pending");
    expect(guest.turn_reminder).toBe("pending");
    expect(guest.turn_expired).toBe("pending");
  });

  it("schedules match_completed for both players on completion", async () => {
    await handleSubmitAction(
      request({
        type: "resign",
        expectedStateVersion: 0,
        idempotencyKey: "r1",
      }),
      active.matchId,
      deps(active.hostId),
    );

    const completed = await active.handle.db
      .select()
      .from(notificationJobs)
      .where(
        and(
          eq(notificationJobs.matchId, active.matchId),
          eq(notificationJobs.type, "match_completed"),
        ),
      );
    expect(completed).toHaveLength(2);
    expect(completed.every((j) => j.status === "pending")).toBe(true);

    // The resigning player's outstanding reminder/expired were cancelled.
    const host = Object.fromEntries(
      (await jobsFor(active.hostPlayerId)).map((j) => [j.type, j.status]),
    );
    expect(host.turn_reminder).toBe("cancelled");
  });

  it("does not schedule turn jobs for a mid-turn move", async () => {
    const before = (await jobsFor(active.hostPlayerId)).length;
    await handleSubmitAction(
      request({
        type: "move_and_wait",
        expectedStateVersion: 0,
        idempotencyKey: "mv",
        unitId: "u1",
        path: [
          { x: 0, y: 1 },
          { x: 1, y: 1 },
        ],
      }),
      active.matchId,
      deps(active.hostId),
    );
    // A mid-turn action adds no notifications.
    expect((await jobsFor(active.hostPlayerId)).length).toBe(before);
  });
});
