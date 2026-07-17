import { randomUUID } from "node:crypto";

import type { Session } from "next-auth";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { matchPlayers } from "../../db/schema/match-players";
import { matches } from "../../db/schema/matches";
import { users } from "../../db/schema/users";
import { createTestDb, type TestDb } from "../../db/__tests__/harness";
import { handleListMatches } from "../list";
import { TEST_MAP_ID } from "./fixtures";

function sessionFor(userId: string): () => Promise<Session | null> {
  return async () => ({
    user: {
      id: userId,
      email: `${userId}@example.edu`,
      name: null,
      image: null,
    },
    expires: "2026-08-01T00:00:00.000Z",
  });
}

async function insertUser(handle: TestDb, email: string): Promise<string> {
  const [row] = await handle.db.insert(users).values({ email }).returning();
  return row.id;
}

async function insertMatch(
  handle: TestDb,
  overrides: Partial<typeof matches.$inferInsert> = {},
): Promise<string> {
  const id = randomUUID();
  await handle.db.insert(matches).values({
    id,
    status: "waiting_for_opponent",
    mapId: TEST_MAP_ID,
    settings: { fogEnabled: false, turnDeadline: "24h", dayLimit: null },
    invitationCode: id.slice(0, 6).toUpperCase(),
    ...overrides,
  });
  return id;
}

describe("list matches endpoint", () => {
  let handle: TestDb;
  let userId: string;
  let otherId: string;

  beforeEach(async () => {
    handle = await createTestDb();
    await handle.applyMigrations();
    userId = await insertUser(handle, "me@example.edu");
    otherId = await insertUser(handle, "other@example.edu");
  });

  afterEach(async () => {
    await handle.close();
  });

  async function join(matchId: string, uid: string, role: "host" | "guest") {
    await handle.db.insert(matchPlayers).values({
      id: randomUUID(),
      matchId,
      userId: uid,
      role,
    });
  }

  it("returns only the caller's matches with the dashboard fields", async () => {
    const mine = await insertMatch(handle);
    const playerId = randomUUID();
    await handle.db.insert(matchPlayers).values({
      id: playerId,
      matchId: mine,
      userId,
      role: "host",
    });

    // A match the caller is not in must not appear.
    const theirs = await insertMatch(handle);
    await join(theirs, otherId, "host");

    const response = await handleListMatches({
      db: handle.db,
      resolveSession: sessionFor(userId),
    });
    expect(response.status).toBe(200);
    const rows = (await response.json()) as Array<{
      matchId: string;
      role: string;
      viewerPlayerId: string;
      status: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      matchId: mine,
      role: "host",
      viewerPlayerId: playerId,
      status: "waiting_for_opponent",
    });
  });

  it("serializes an active match's deadline as an ISO string", async () => {
    const deadline = new Date("2026-07-20T12:00:00.000Z");
    const active = await insertMatch(handle, {
      status: "active",
      activePlayerId: "p-active",
      turnDeadlineAt: deadline,
    });
    await join(active, userId, "host");

    const response = await handleListMatches({
      db: handle.db,
      resolveSession: sessionFor(userId),
    });
    const rows = (await response.json()) as Array<{
      activePlayerId: string | null;
      turnDeadlineAt: string | null;
    }>;
    expect(rows[0].activePlayerId).toBe("p-active");
    expect(rows[0].turnDeadlineAt).toBe(deadline.toISOString());
  });

  it("returns the caller's matches newest-first", async () => {
    const older = await insertMatch(handle, {
      createdAt: new Date("2026-07-10T00:00:00.000Z"),
    });
    const newer = await insertMatch(handle, {
      createdAt: new Date("2026-07-15T00:00:00.000Z"),
    });
    await join(older, userId, "host");
    await join(newer, userId, "host");

    const response = await handleListMatches({
      db: handle.db,
      resolveSession: sessionFor(userId),
    });
    const rows = (await response.json()) as Array<{ matchId: string }>;
    expect(rows.map((r) => r.matchId)).toEqual([newer, older]);
  });

  it("returns an empty list for a user with no matches", async () => {
    const response = await handleListMatches({
      db: handle.db,
      resolveSession: sessionFor(userId),
    });
    expect(await response.json()).toEqual([]);
  });

  it("includes matches the caller joined as guest", async () => {
    const match = await insertMatch(handle, { status: "commander_selection" });
    await join(match, otherId, "host");
    await join(match, userId, "guest");

    const response = await handleListMatches({
      db: handle.db,
      resolveSession: sessionFor(userId),
    });
    const rows = (await response.json()) as Array<{
      matchId: string;
      role: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ matchId: match, role: "guest" });
  });

  it("rejects an unauthenticated caller with 401", async () => {
    const response = await handleListMatches({
      db: handle.db,
      resolveSession: async () => null,
    });
    expect(response.status).toBe(401);
  });
});
