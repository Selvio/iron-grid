import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  cancelPendingJobs,
  claimDueJobs,
  enqueueNotificationJob,
  markJobCancelled,
  markJobSent,
} from "../queries/notification-jobs";
import { matchPlayers } from "../schema/match-players";
import { notificationJobs } from "../schema/notification-jobs";
import { users } from "../schema/users";
import { createTestDb, type TestDb } from "./harness";
import { insertDraftMatch } from "./fixtures";

const NOW = new Date("2026-07-17T12:00:00.000Z");
const PAST = new Date("2026-07-17T11:00:00.000Z");
const FUTURE = new Date("2026-07-17T13:00:00.000Z");

describe("notification_jobs queries", () => {
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

  const job = (overrides: Record<string, unknown> = {}) => ({
    matchId: "match-1",
    playerId,
    type: "turn_reminder" as const,
    scheduledAt: NOW,
    dedupeKey: "turn-1",
    ...overrides,
  });

  it("enqueues a pending job and dedupes an identical one", async () => {
    await enqueueNotificationJob(handle.db, job());
    await enqueueNotificationJob(handle.db, job()); // same (match, player, type, key)

    const rows = await handle.db.select().from(notificationJobs);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "turn_reminder", status: "pending" });
  });

  it("allows the same type with a different dedupe key (next turn)", async () => {
    await enqueueNotificationJob(handle.db, job({ dedupeKey: "turn-1" }));
    await enqueueNotificationJob(handle.db, job({ dedupeKey: "turn-2" }));
    expect(await handle.db.select().from(notificationJobs)).toHaveLength(2);
  });

  it("claims only due pending jobs in schedule order", async () => {
    await enqueueNotificationJob(
      handle.db,
      job({ dedupeKey: "later", scheduledAt: NOW }),
    );
    await enqueueNotificationJob(
      handle.db,
      job({ dedupeKey: "earlier", scheduledAt: PAST }),
    );
    await enqueueNotificationJob(
      handle.db,
      job({ dedupeKey: "future", scheduledAt: FUTURE }),
    );

    const due = await claimDueJobs(handle.db, NOW, 10);
    expect(due.map((j) => j.dedupeKey)).toEqual(["earlier", "later"]);
  });

  it("marks a job sent and cancelled", async () => {
    await enqueueNotificationJob(handle.db, job());
    const [row] = await handle.db.select().from(notificationJobs);

    await markJobSent(handle.db, row.id, NOW);
    const [sent] = await handle.db
      .select()
      .from(notificationJobs)
      .where(eq(notificationJobs.id, row.id));
    expect(sent.status).toBe("sent");
    expect(sent.sentAt).toBeInstanceOf(Date);

    await markJobCancelled(handle.db, row.id);
    const [cancelled] = await handle.db
      .select()
      .from(notificationJobs)
      .where(eq(notificationJobs.id, row.id));
    expect(cancelled.status).toBe("cancelled");
  });

  it("cancels pending jobs of the given types on hand-off", async () => {
    await enqueueNotificationJob(handle.db, job({ type: "turn_reminder" }));
    await enqueueNotificationJob(handle.db, job({ type: "turn_expired" }));
    await enqueueNotificationJob(handle.db, job({ type: "turn_started" }));

    await cancelPendingJobs(handle.db, "match-1", playerId, [
      "turn_reminder",
      "turn_expired",
    ]);

    const rows = await handle.db.select().from(notificationJobs);
    const byType = Object.fromEntries(rows.map((r) => [r.type, r.status]));
    expect(byType.turn_reminder).toBe("cancelled");
    expect(byType.turn_expired).toBe("cancelled");
    // turn_started (not in the list) is untouched.
    expect(byType.turn_started).toBe("pending");
  });
});
