import { randomUUID } from "node:crypto";

import type { Session } from "next-auth";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { matchPlayers } from "../../db/schema/match-players";
import { matches } from "../../db/schema/matches";
import { users } from "../../db/schema/users";
import { createTestDb, type TestDb } from "../../db/__tests__/harness";
import { handleCancelMatch } from "../cancel";
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

describe("cancel match endpoint", () => {
  let handle: TestDb;
  let hostId: string;
  let outsiderId: string;
  let matchId: string;

  beforeEach(async () => {
    handle = await createTestDb();
    await handle.applyMigrations();
    hostId = await insertUser(handle, "host@example.edu");
    outsiderId = await insertUser(handle, "outsider@example.edu");
    matchId = randomUUID();
    await handle.db.insert(matches).values({
      id: matchId,
      status: "waiting_for_opponent",
      mapId: TEST_MAP_ID,
      settings: { fogEnabled: false, turnDeadline: "24h", dayLimit: null },
      invitationCode: "ABC234",
    });
    await handle.db.insert(matchPlayers).values({
      id: randomUUID(),
      matchId,
      userId: hostId,
      role: "host",
    });
  });

  afterEach(async () => {
    await handle.close();
  });

  function deps(userId: string) {
    return { db: handle.db, resolveSession: sessionFor(userId) };
  }

  it.each([
    "draft",
    "waiting_for_opponent",
    "commander_selection",
    "ready_check",
  ] as const)("cancels a match in %s", async (status) => {
    await handle.db
      .update(matches)
      .set({ status })
      .where(eq(matches.id, matchId));

    const response = await handleCancelMatch(matchId, deps(hostId));
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("cancelled");

    const [match] = await handle.db
      .select()
      .from(matches)
      .where(eq(matches.id, matchId));
    expect(match.status).toBe("cancelled");
  });

  it("rejects cancelling an active match with 409 and leaves it active", async () => {
    await handle.db
      .update(matches)
      .set({ status: "active" })
      .where(eq(matches.id, matchId));
    const response = await handleCancelMatch(matchId, deps(hostId));
    expect(response.status).toBe(409);

    const [match] = await handle.db
      .select()
      .from(matches)
      .where(eq(matches.id, matchId));
    expect(match.status).toBe("active");
  });

  it("rejects cancelling a completed match with 409", async () => {
    await handle.db
      .update(matches)
      .set({ status: "completed" })
      .where(eq(matches.id, matchId));
    const response = await handleCancelMatch(matchId, deps(hostId));
    expect(response.status).toBe(409);
  });

  it("rejects cancelling an already-cancelled match with 409", async () => {
    await handleCancelMatch(matchId, deps(hostId));
    const response = await handleCancelMatch(matchId, deps(hostId));
    expect(response.status).toBe(409);
  });

  it("rejects a non-member with 403", async () => {
    const response = await handleCancelMatch(matchId, deps(outsiderId));
    expect(response.status).toBe(403);
  });

  it("returns 401 when unauthenticated", async () => {
    const response = await handleCancelMatch(matchId, {
      db: handle.db,
      resolveSession: async () => null,
    });
    expect(response.status).toBe(401);
  });
});
