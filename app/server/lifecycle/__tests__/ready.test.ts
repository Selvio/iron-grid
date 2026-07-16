import { randomUUID } from "node:crypto";

import type { Session } from "next-auth";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { events } from "../../db/schema/events";
import { matchPlayers } from "../../db/schema/match-players";
import { matches } from "../../db/schema/matches";
import { playerEvents } from "../../db/schema/player-events";
import { users } from "../../db/schema/users";
import { createTestDb, type TestDb } from "../../db/__tests__/harness";
import { handleReadyMatch } from "../ready";
import { fixtureGameData, TEST_MAP_ID } from "./fixtures";

const NOW = new Date("2026-07-16T12:00:00.000Z");

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

function readyRequest(): Request {
  return new Request("https://iron-grid.test/api/matches/m/ready", {
    method: "POST",
  });
}

async function insertUser(handle: TestDb, email: string): Promise<string> {
  const [row] = await handle.db.insert(users).values({ email }).returning();
  return row.id;
}

describe("ready + activation endpoint", () => {
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
        isReady: false,
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
    return {
      db: handle.db,
      gameData: fixtureGameData(),
      resolveSession: sessionFor(userId),
      now: () => NOW,
      // Force the host player row as the server-random first player.
      chooseFirstPlayer: () => hostPlayerId,
      generateSeed: () => "fixed-seed",
    };
  }

  it("marks the first player ready without activating", async () => {
    const response = await handleReadyMatch(
      readyRequest(),
      matchId,
      deps(hostId),
    );
    expect((await response.json()).status).toBe("ready_check");

    const [match] = await handle.db
      .select()
      .from(matches)
      .where(eq(matches.id, matchId));
    expect(match.status).toBe("ready_check");
    expect(match.state).toBeNull();
  });

  it("activates atomically once both are ready", async () => {
    await handleReadyMatch(readyRequest(), matchId, deps(hostId));
    const response = await handleReadyMatch(
      readyRequest(),
      matchId,
      deps(guestId),
    );
    expect((await response.json()).status).toBe("active");

    const [match] = await handle.db
      .select()
      .from(matches)
      .where(eq(matches.id, matchId));
    expect(match.status).toBe("active");
    expect(match.gameDataVersion).toBe("1.0.0");
    expect(match.randomSeed).toBe("fixed-seed");
    expect(match.activatedAt).toBeInstanceOf(Date);
    expect(match.dayCounter).toBe(1);
    // The injected server-random first player is the active player, and the
    // column mirrors the snapshot's stateVersion.
    expect(match.activePlayerId).toBe(hostPlayerId);
    expect(match.stateVersion).toBe(0);

    // The persisted snapshot actually laid out the map: both players, the two
    // starting units, and the three properties are present.
    expect(match.state).not.toBeNull();
    const state = match.state!;
    expect(state.players).toHaveLength(2);
    expect(state.units).toHaveLength(2);
    expect(state.properties).toHaveLength(3);
    expect(state.match.activePlayerId).toBe(hostPlayerId);

    const log = await handle.db
      .select()
      .from(events)
      .where(eq(events.matchId, matchId));
    const types = log.map((e) => e.type);
    expect(types).toContain("match_started");
    expect(types).toContain("turn_started");

    // Every authoritative event has a per-player row for both players.
    const projections = await handle.db
      .select()
      .from(playerEvents)
      .where(eq(playerEvents.matchId, matchId));
    expect(projections).toHaveLength(log.length * 2);
  });

  it("does not re-activate on a third ready call", async () => {
    await handleReadyMatch(readyRequest(), matchId, deps(hostId));
    await handleReadyMatch(readyRequest(), matchId, deps(guestId));

    const response = await handleReadyMatch(
      readyRequest(),
      matchId,
      deps(hostId),
    );
    expect(response.status).toBe(409);

    // Still exactly one activation's worth of events.
    const log = await handle.db
      .select()
      .from(events)
      .where(eq(events.matchId, matchId));
    expect(log.filter((e) => e.type === "match_started")).toHaveLength(1);
  });

  it("rejects a non-member with 403", async () => {
    const response = await handleReadyMatch(
      readyRequest(),
      matchId,
      deps(outsiderId),
    );
    expect(response.status).toBe(403);
  });

  it("rejects ready outside ready_check with 409", async () => {
    await handle.db
      .update(matches)
      .set({ status: "commander_selection" })
      .where(eq(matches.id, matchId));
    const response = await handleReadyMatch(
      readyRequest(),
      matchId,
      deps(hostId),
    );
    expect(response.status).toBe(409);
  });

  it("returns 401 when unauthenticated", async () => {
    const response = await handleReadyMatch(readyRequest(), matchId, {
      db: handle.db,
      gameData: fixtureGameData(),
      resolveSession: async () => null,
    });
    expect(response.status).toBe(401);
  });
});
