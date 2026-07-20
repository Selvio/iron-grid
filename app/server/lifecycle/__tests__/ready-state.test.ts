import { randomUUID } from "node:crypto";

import type { Session } from "next-auth";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { matchPlayers } from "../../db/schema/match-players";
import { matches } from "../../db/schema/matches";
import { users } from "../../db/schema/users";
import { createTestDb, type TestDb } from "../../db/__tests__/harness";
import { handleGetReadyState } from "../ready-state";
import { TEST_MAP_ID } from "./fixtures";

/**
 * `GET /api/matches/:id/ready` — the ready check's polled state (M11-T1).
 *
 * The endpoint the live-sync loop hits, so its membership scoping matters as
 * much as the shape it returns: a match id from the URL bar must disclose
 * nothing to someone who does not hold a seat.
 */

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

describe("ready-state read endpoint", () => {
  let handle: TestDb;
  let hostId: string;
  let guestId: string;
  let outsiderId: string;
  let matchId: string;
  let hostPlayerId: string;

  beforeEach(async () => {
    handle = await createTestDb();
    await handle.applyMigrations();
    hostId = await insertUser(handle, "host@example.edu");
    guestId = await insertUser(handle, "guest@example.edu");
    outsiderId = await insertUser(handle, "outsider@example.edu");
    matchId = randomUUID();
    hostPlayerId = randomUUID();
    await handle.db.insert(matches).values({
      id: matchId,
      status: "ready_check",
      mapId: TEST_MAP_ID,
      settings: { fogEnabled: false, turnDeadline: "24h", dayLimit: null },
      invitationCode: "ABC234",
    });
    await handle.db.insert(matchPlayers).values([
      {
        id: hostPlayerId,
        matchId,
        userId: hostId,
        role: "host",
        factionId: "blue",
        commanderId: "cmdr-blue",
        isReady: true,
      },
      {
        id: randomUUID(),
        matchId,
        userId: guestId,
        role: "guest",
        factionId: "red",
        commanderId: "cmdr-red",
        isReady: false,
      },
    ]);
  });

  afterEach(async () => {
    await handle.close();
  });

  function deps(userId: string) {
    return { db: handle.db, resolveSession: sessionFor(userId) };
  }

  it("returns both seats with the caller's own first", async () => {
    const response = await handleGetReadyState(matchId, deps(hostId));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("ready_check");
    expect(body.seats).toHaveLength(2);
    expect(body.seats[0]).toMatchObject({
      playerId: hostPlayerId,
      factionId: "blue",
      isReady: true,
      isViewer: true,
    });
    expect(body.seats[1]).toMatchObject({ factionId: "red", isReady: false });
  });

  it("reflects the opponent confirming — the whole point of polling it", async () => {
    await handle.db
      .update(matchPlayers)
      .set({ isReady: true })
      .where(eq(matchPlayers.userId, guestId));

    const body = await (
      await handleGetReadyState(matchId, deps(hostId))
    ).json();
    expect(body.seats.every((s: { isReady: boolean }) => s.isReady)).toBe(true);
  });

  it("marks the viewer's seat from the caller, not the row order", async () => {
    const body = await (
      await handleGetReadyState(matchId, deps(guestId))
    ).json();
    expect(body.seats[0]).toMatchObject({ factionId: "red", isViewer: true });
  });

  it("discloses nothing to a non-member", async () => {
    const response = await handleGetReadyState(matchId, deps(outsiderId));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "not_match_player" });
  });

  it("does not distinguish an unknown match from one you are not in", async () => {
    const response = await handleGetReadyState(randomUUID(), deps(hostId));
    expect(response.status).toBe(403);
  });
});
