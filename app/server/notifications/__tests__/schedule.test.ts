import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { matchPlayers } from "../../db/schema/match-players";
import { notificationJobs } from "../../db/schema/notification-jobs";
import { users } from "../../db/schema/users";
import { createTestDb, type TestDb } from "../../db/__tests__/harness";
import { insertDraftMatch } from "../../db/__tests__/fixtures";
import { scheduleTurnNotifications } from "../enqueue";

const NOW = new Date("2026-07-16T12:00:00.000Z");
const DEADLINE = "2026-07-17T12:00:00.000Z"; // NOW + 24h

describe("scheduleTurnNotifications", () => {
  let handle: TestDb;
  let playerId: string;

  beforeEach(async () => {
    handle = await createTestDb();
    await handle.applyMigrations();
    await insertDraftMatch(handle);
    const [user] = await handle.db
      .insert(users)
      .values({ email: "p@example.edu" })
      .returning();
    playerId = randomUUID();
    await handle.db.insert(matchPlayers).values({
      id: playerId,
      matchId: "match-1",
      userId: user.id,
      role: "host",
    });
  });

  afterEach(async () => {
    await handle.close();
  });

  async function scheduledByType() {
    const rows = await handle.db
      .select()
      .from(notificationJobs)
      .where(eq(notificationJobs.matchId, "match-1"));
    return Object.fromEntries(rows.map((r) => [r.type, r.scheduledAt]));
  }

  it("schedules turn_started now, reminder at 20% remaining, expired at the deadline", async () => {
    await scheduleTurnNotifications(handle.db, {
      matchId: "match-1",
      activePlayerId: playerId,
      turnDeadlineAt: DEADLINE,
      turnDeadline: "24h",
      now: NOW,
      priorActivePlayerId: null,
      dedupeKey: "t1",
    });

    const at = await scheduledByType();
    const deadlineMs = new Date(DEADLINE).getTime();
    expect(at.turn_started).toEqual(NOW);
    // 20% of 24h (4.8h) before the deadline.
    expect(at.turn_reminder).toEqual(
      new Date(deadlineMs - 0.2 * 24 * 60 * 60 * 1000),
    );
    expect(at.turn_expired).toEqual(new Date(deadlineMs));
  });

  it("schedules only turn_started for a none-deadline match", async () => {
    await scheduleTurnNotifications(handle.db, {
      matchId: "match-1",
      activePlayerId: playerId,
      turnDeadlineAt: null,
      turnDeadline: "none",
      now: NOW,
      priorActivePlayerId: null,
      dedupeKey: "t1",
    });

    const at = await scheduledByType();
    expect(at.turn_started).toEqual(NOW);
    expect(at.turn_reminder).toBeUndefined();
    expect(at.turn_expired).toBeUndefined();
  });
});
