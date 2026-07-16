import type { Session } from "next-auth";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { matchPlayers } from "../../db/schema/match-players";
import { matches } from "../../db/schema/matches";
import { users } from "../../db/schema/users";
import { createTestDb, type TestDb } from "../../db/__tests__/harness";
import { handleCreateMatch } from "../create";
import { createInvitationRateLimiter } from "../rate-limit";
import { fixtureGameData, TEST_MAP_ID } from "./fixtures";

function sessionFor(userId: string): () => Promise<Session | null> {
  return async () => ({
    user: { id: userId, email: "host@example.edu", name: null, image: null },
    expires: "2026-08-01T00:00:00.000Z",
  });
}

function createRequest(body: unknown): Request {
  return new Request("https://iron-grid.test/api/matches", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const VALID_BODY = {
  mapId: TEST_MAP_ID,
  settings: { fogEnabled: false, turnDeadline: "24h", dayLimit: null },
};

/** A fresh permissive limiter per call so tests never share window state. */
function deps(handle: TestDb, userId: string) {
  return {
    db: handle.db,
    gameData: fixtureGameData(),
    resolveSession: sessionFor(userId),
    rateLimiter: createInvitationRateLimiter(100),
  };
}

describe("create match endpoint", () => {
  let handle: TestDb;
  let hostId: string;

  beforeEach(async () => {
    handle = await createTestDb();
    await handle.applyMigrations();
    const [row] = await handle.db
      .insert(users)
      .values({ email: "host@example.edu" })
      .returning();
    hostId = row.id;
  });

  afterEach(async () => {
    await handle.close();
  });

  it("creates a waiting_for_opponent match with a host row and code", async () => {
    const response = await handleCreateMatch(
      createRequest(VALID_BODY),
      deps(handle, hostId),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      matchId: string;
      invitationCode: string;
      status: string;
    };
    expect(body.status).toBe("waiting_for_opponent");
    expect(body.invitationCode).toMatch(
      /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/,
    );

    const [match] = await handle.db
      .select()
      .from(matches)
      .where(eq(matches.id, body.matchId));
    expect(match).toMatchObject({
      status: "waiting_for_opponent",
      mapId: TEST_MAP_ID,
      invitationCode: body.invitationCode,
    });

    const players = await handle.db
      .select()
      .from(matchPlayers)
      .where(eq(matchPlayers.matchId, body.matchId));
    expect(players).toHaveLength(1);
    expect(players[0]).toMatchObject({ role: "host", userId: hostId });
  });

  it("rejects an unknown map id with 400", async () => {
    const response = await handleCreateMatch(
      createRequest({ ...VALID_BODY, mapId: "no-such-map" }),
      deps(handle, hostId),
    );
    expect(response.status).toBe(400);
  });

  it("rejects malformed settings with 400", async () => {
    const response = await handleCreateMatch(
      createRequest({
        mapId: TEST_MAP_ID,
        settings: { fogEnabled: false, turnDeadline: "weekly", dayLimit: null },
      }),
      deps(handle, hostId),
    );
    expect(response.status).toBe(400);
  });

  it("rejects a malformed JSON body with 400", async () => {
    const response = await handleCreateMatch(
      createRequest("not json"),
      deps(handle, hostId),
    );
    expect(response.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    const response = await handleCreateMatch(createRequest(VALID_BODY), {
      db: handle.db,
      gameData: fixtureGameData(),
      resolveSession: async () => null,
      rateLimiter: createInvitationRateLimiter(100),
    });
    expect(response.status).toBe(401);
  });

  it("enforces the invitation rate limit with 429", async () => {
    const limited = {
      db: handle.db,
      gameData: fixtureGameData(),
      resolveSession: sessionFor(hostId),
      rateLimiter: createInvitationRateLimiter(1),
    };
    expect(
      (await handleCreateMatch(createRequest(VALID_BODY), limited)).status,
    ).toBe(201);
    expect(
      (await handleCreateMatch(createRequest(VALID_BODY), limited)).status,
    ).toBe(429);
  });

  it("generates unambiguous unique codes across many creates", async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      const response = await handleCreateMatch(
        createRequest(VALID_BODY),
        deps(handle, hostId),
      );
      const { invitationCode } = (await response.json()) as {
        invitationCode: string;
      };
      expect(invitationCode).not.toMatch(/[01OI]/);
      codes.add(invitationCode);
    }
    expect(codes.size).toBe(20);
  });
});
