import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { enqueueNotificationJob } from "../../db";
import { matchPlayers } from "../../db/schema/match-players";
import { notificationJobs } from "../../db/schema/notification-jobs";
import { users } from "../../db/schema/users";
import { createTestDb, type TestDb } from "../../db/__tests__/harness";
import { insertDraftMatch } from "../../db/__tests__/fixtures";
import { drainNotifications } from "../drain";
import type { NotificationEmail, NotificationMailer } from "../mailer";

const NOW = new Date("2026-07-17T12:00:00.000Z");
const PAST = new Date("2026-07-17T11:00:00.000Z");
const FUTURE = new Date("2026-07-17T13:00:00.000Z");

/** A mailer that records what it was asked to send. */
function recordingMailer(): {
  readonly sent: NotificationEmail[];
  readonly mailer: NotificationMailer;
} {
  const sent: NotificationEmail[] = [];
  return { sent, mailer: { send: async (email) => void sent.push(email) } };
}

describe("notification drain", () => {
  let handle: TestDb;
  let playerId: string;

  beforeEach(async () => {
    handle = await createTestDb();
    await handle.applyMigrations();
    await insertDraftMatch(handle);
    const [user] = await handle.db
      .insert(users)
      .values({ email: "player@example.edu" })
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

  const enqueue = (type: string, scheduledAt: Date, dedupeKey: string) =>
    enqueueNotificationJob(handle.db, {
      matchId: "match-1",
      playerId,
      type: type as "turn_started",
      scheduledAt,
      dedupeKey,
    });

  async function jobStatus(dedupeKey: string) {
    const [row] = await handle.db
      .select()
      .from(notificationJobs)
      .where(eq(notificationJobs.dedupeKey, dedupeKey));
    return row.status;
  }

  it("delivers a due job to an opted-in recipient and marks it sent", async () => {
    await enqueue("turn_started", PAST, "t1"); // turn_started default preference is on
    const { sent, mailer } = recordingMailer();

    const result = await drainNotifications({
      db: handle.db,
      mailer,
      now: () => NOW,
    });

    expect(result).toEqual({ sent: 1, cancelled: 0, failed: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: "player@example.edu",
      type: "turn_started",
    });
    expect(await jobStatus("t1")).toBe("sent");
  });

  it("cancels a job whose recipient toggled the trigger off (no send)", async () => {
    // turn_expired default preference is off.
    await enqueue("turn_expired", PAST, "t2");
    const { sent, mailer } = recordingMailer();

    const result = await drainNotifications({
      db: handle.db,
      mailer,
      now: () => NOW,
    });

    expect(result).toEqual({ sent: 0, cancelled: 1, failed: 0 });
    expect(sent).toHaveLength(0);
    expect(await jobStatus("t2")).toBe("cancelled");
  });

  it("does not drain a job scheduled in the future", async () => {
    await enqueue("turn_started", FUTURE, "t3");
    const { sent, mailer } = recordingMailer();

    const result = await drainNotifications({
      db: handle.db,
      mailer,
      now: () => NOW,
    });

    expect(result.sent).toBe(0);
    expect(sent).toHaveLength(0);
    expect(await jobStatus("t3")).toBe("pending");
  });

  it("leaves a job pending when delivery fails (retryable)", async () => {
    await enqueue("turn_started", PAST, "t4");
    const failing: NotificationMailer = {
      send: async () => {
        throw new Error("Resend rejected the request");
      },
    };

    const result = await drainNotifications({
      db: handle.db,
      mailer: failing,
      now: () => NOW,
    });

    expect(result).toEqual({ sent: 0, cancelled: 0, failed: 1 });
    expect(await jobStatus("t4")).toBe("pending");
  });
});
