import { randomUUID } from "node:crypto";

import type { Session } from "next-auth";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { matchPlayers } from "../../db/schema/match-players";
import { matches } from "../../db/schema/matches";
import { notificationJobs } from "../../db/schema/notification-jobs";
import { users } from "../../db/schema/users";
import { createTestDb, type TestDb } from "../../db/__tests__/harness";
import { handleJoinMatch } from "../join";
import { createInvitationRateLimiter } from "../rate-limit";
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

function joinRequest(body: unknown): Request {
  return new Request("https://iron-grid.test/api/matches/m/join", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function insertUser(handle: TestDb, email: string): Promise<string> {
  const [row] = await handle.db.insert(users).values({ email }).returning();
  return row.id;
}

const CODE = "ABC234";

describe("join match endpoint", () => {
  let handle: TestDb;
  let hostId: string;
  let guestId: string;
  let matchId: string;

  beforeEach(async () => {
    handle = await createTestDb();
    await handle.applyMigrations();
    hostId = await insertUser(handle, "host@example.edu");
    guestId = await insertUser(handle, "guest@example.edu");
    matchId = randomUUID();
    await handle.db.insert(matches).values({
      id: matchId,
      status: "waiting_for_opponent",
      mapId: TEST_MAP_ID,
      settings: { fogEnabled: false, turnDeadline: "24h", dayLimit: null },
      invitationCode: CODE,
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
    return {
      db: handle.db,
      resolveSession: sessionFor(userId),
      rateLimiter: createInvitationRateLimiter(100),
    };
  }

  it("enqueues a match_invitation for the host on accept", async () => {
    await handleJoinMatch(joinRequest({ code: CODE }), matchId, deps(guestId));
    const invites = await handle.db
      .select()
      .from(notificationJobs)
      .where(
        and(
          eq(notificationJobs.matchId, matchId),
          eq(notificationJobs.type, "match_invitation"),
        ),
      );
    expect(invites).toHaveLength(1);
  });

  it("accepts a guest by code and moves to commander_selection", async () => {
    const response = await handleJoinMatch(
      joinRequest({ code: CODE }),
      matchId,
      deps(guestId),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("commander_selection");

    const [match] = await handle.db
      .select()
      .from(matches)
      .where(eq(matches.id, matchId));
    expect(match.status).toBe("commander_selection");

    const players = await handle.db
      .select()
      .from(matchPlayers)
      .where(eq(matchPlayers.matchId, matchId));
    expect(players).toHaveLength(2);
    expect(players.find((p) => p.role === "guest")).toMatchObject({
      userId: guestId,
    });
  });

  it("resolves the match from the invitation code alone", async () => {
    const response = await handleJoinMatch(
      joinRequest({ code: CODE.toLowerCase() }),
      undefined,
      deps(guestId),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      matchId,
      status: "commander_selection",
    });
  });

  it("rejects an unknown code with 404 when resolving by code alone", async () => {
    const response = await handleJoinMatch(
      joinRequest({ code: "WRONG5" }),
      undefined,
      deps(guestId),
    );
    expect(response.status).toBe(404);
  });

  it("rejects a wrong code with 404 (no existence leak)", async () => {
    const response = await handleJoinMatch(
      joinRequest({ code: "WRONG5" }),
      matchId,
      deps(guestId),
    );
    expect(response.status).toBe(404);
  });

  it("rejects an unknown match with the same 404", async () => {
    const response = await handleJoinMatch(
      joinRequest({ code: CODE }),
      "no-such-match",
      deps(guestId),
    );
    expect(response.status).toBe(404);
  });

  it("rejects joining a match that is not waiting with 409", async () => {
    await handle.db
      .update(matches)
      .set({ status: "commander_selection" })
      .where(eq(matches.id, matchId));
    const response = await handleJoinMatch(
      joinRequest({ code: CODE }),
      matchId,
      deps(guestId),
    );
    expect(response.status).toBe(409);

    // No guest row was written — only the host remains.
    const players = await handle.db
      .select()
      .from(matchPlayers)
      .where(eq(matchPlayers.matchId, matchId));
    expect(players).toHaveLength(1);
  });

  it("rejects the host joining their own match with 409", async () => {
    const response = await handleJoinMatch(
      joinRequest({ code: CODE }),
      matchId,
      deps(hostId),
    );
    expect(response.status).toBe(409);
  });

  it("returns 401 when unauthenticated", async () => {
    const response = await handleJoinMatch(
      joinRequest({ code: CODE }),
      matchId,
      {
        db: handle.db,
        resolveSession: async () => null,
        rateLimiter: createInvitationRateLimiter(100),
      },
    );
    expect(response.status).toBe(401);
  });

  it("rejects a body without a code string with 404", async () => {
    const response = await handleJoinMatch(
      joinRequest({ nope: true }),
      matchId,
      deps(guestId),
    );
    expect(response.status).toBe(404);
  });
});
