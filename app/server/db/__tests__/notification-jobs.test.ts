import { asc, eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { matchPlayers } from "../schema/match-players";
import { notificationJobs } from "../schema/notification-jobs";
import { createTestDb, type TestDb } from "./harness";
import { insertDraftMatch } from "./fixtures";

describe("notification jobs", () => {
  let handle: TestDb;

  beforeEach(async () => {
    handle = await createTestDb();
    await handle.applyMigrations();
    await insertDraftMatch(handle);
    await handle.db
      .insert(matchPlayers)
      .values({ id: "p1", matchId: "match-1", role: "host" });
  });

  afterEach(async () => {
    await handle.close();
  });

  it("stores a job with pending status and no sent timestamp by default", async () => {
    await handle.db.insert(notificationJobs).values({
      matchId: "match-1",
      playerId: "p1",
      type: "turn_reminder",
      scheduledAt: new Date("2026-07-20T00:00:00.000Z"),
      dedupeKey: "turn-1",
    });

    const [job] = await handle.db.select().from(notificationJobs);
    expect(job).toMatchObject({ type: "turn_reminder", status: "pending" });
    expect(job.sentAt).toBeNull();
  });

  it("supports the scheduler scan over pending jobs by schedule time", async () => {
    await handle.db.insert(notificationJobs).values([
      {
        matchId: "match-1",
        playerId: "p1",
        type: "turn_reminder",
        scheduledAt: new Date("2026-07-20T10:00:00.000Z"),
        dedupeKey: "turn-a",
      },
      {
        matchId: "match-1",
        playerId: "p1",
        type: "turn_expired",
        scheduledAt: new Date("2026-07-20T08:00:00.000Z"),
        status: "sent",
        dedupeKey: "turn-b",
      },
    ]);

    const due = await handle.db
      .select()
      .from(notificationJobs)
      .where(eq(notificationJobs.status, "pending"))
      .orderBy(asc(notificationJobs.scheduledAt));
    expect(due.map((j) => j.type)).toEqual(["turn_reminder"]);
  });

  it("creates the (status, scheduled_at) scheduler index", async () => {
    const result = await handle.db.execute<{ indexname: string }>(
      sql`select indexname from pg_indexes where tablename = 'notification_jobs'`,
    );
    expect(result.rows.map((r) => r.indexname)).toContain(
      "notification_jobs_status_scheduled_at_idx",
    );
  });

  it("rejects a job for a nonexistent player", async () => {
    await expect(
      handle.db.insert(notificationJobs).values({
        matchId: "match-1",
        playerId: "ghost",
        type: "turn_started",
        scheduledAt: new Date("2026-07-20T00:00:00.000Z"),
        dedupeKey: "turn-1",
      }),
    ).rejects.toThrow();
  });
});
