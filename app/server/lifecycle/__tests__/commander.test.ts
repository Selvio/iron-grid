import { randomUUID } from "node:crypto";

import type { Session } from "next-auth";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { matchPlayers } from "../../db/schema/match-players";
import { matches } from "../../db/schema/matches";
import { users } from "../../db/schema/users";
import { createTestDb, type TestDb } from "../../db/__tests__/harness";
import { handleSelectCommander } from "../commander";
import { fixtureGameData, TEST_MAP_ID } from "./fixtures";

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

function commanderRequest(body: unknown): Request {
  return new Request("https://iron-grid.test/api/matches/m/commander", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function insertUser(handle: TestDb, email: string): Promise<string> {
  const [row] = await handle.db.insert(users).values({ email }).returning();
  return row.id;
}

describe("commander selection endpoint", () => {
  let handle: TestDb;
  let hostId: string;
  let guestId: string;
  let outsiderId: string;
  let matchId: string;

  beforeEach(async () => {
    handle = await createTestDb();
    await handle.applyMigrations();
    hostId = await insertUser(handle, "host@example.edu");
    guestId = await insertUser(handle, "guest@example.edu");
    outsiderId = await insertUser(handle, "outsider@example.edu");
    matchId = randomUUID();
    await handle.db.insert(matches).values({
      id: matchId,
      status: "commander_selection",
      mapId: TEST_MAP_ID,
      settings: { fogEnabled: false, turnDeadline: "24h", dayLimit: null },
      invitationCode: "ABC234",
    });
    await handle.db.insert(matchPlayers).values([
      { id: randomUUID(), matchId, userId: hostId, role: "host" },
      { id: randomUUID(), matchId, userId: guestId, role: "guest" },
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
    };
  }

  it("records a selection and stays in commander_selection until both pick", async () => {
    const response = await handleSelectCommander(
      commanderRequest({ commanderId: "cmdr-blue" }),
      matchId,
      deps(hostId),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("commander_selection");

    const [host] = await handle.db
      .select()
      .from(matchPlayers)
      .where(
        and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, hostId)),
      );
    expect(host).toMatchObject({ commanderId: "cmdr-blue", factionId: "blue" });
  });

  it("gates to ready_check once both members have selected", async () => {
    await handleSelectCommander(
      commanderRequest({ commanderId: "cmdr-blue" }),
      matchId,
      deps(hostId),
    );
    const response = await handleSelectCommander(
      commanderRequest({ commanderId: "cmdr-red" }),
      matchId,
      deps(guestId),
    );
    expect((await response.json()).status).toBe("ready_check");

    const [match] = await handle.db
      .select()
      .from(matches)
      .where(eq(matches.id, matchId));
    expect(match.status).toBe("ready_check");
  });

  it("rejects a commander already taken by the opponent with 409", async () => {
    await handleSelectCommander(
      commanderRequest({ commanderId: "cmdr-blue" }),
      matchId,
      deps(hostId),
    );
    const response = await handleSelectCommander(
      commanderRequest({ commanderId: "cmdr-blue" }),
      matchId,
      deps(guestId),
    );
    expect(response.status).toBe(409);

    // The rejected guest kept no commander.
    const [guest] = await handle.db
      .select()
      .from(matchPlayers)
      .where(
        and(
          eq(matchPlayers.matchId, matchId),
          eq(matchPlayers.userId, guestId),
        ),
      );
    expect(guest.commanderId).toBeNull();
  });

  it("rejects an unknown commander id with 409", async () => {
    const response = await handleSelectCommander(
      commanderRequest({ commanderId: "cmdr-nonesuch" }),
      matchId,
      deps(hostId),
    );
    expect(response.status).toBe(409);
  });

  it("rejects a non-member with 403", async () => {
    const response = await handleSelectCommander(
      commanderRequest({ commanderId: "cmdr-blue" }),
      matchId,
      deps(outsiderId),
    );
    expect(response.status).toBe(403);
  });

  it("rejects selection outside commander_selection with 409", async () => {
    await handle.db
      .update(matches)
      .set({ status: "ready_check" })
      .where(eq(matches.id, matchId));
    const response = await handleSelectCommander(
      commanderRequest({ commanderId: "cmdr-blue" }),
      matchId,
      deps(hostId),
    );
    expect(response.status).toBe(409);
  });

  it("returns 401 when unauthenticated", async () => {
    const response = await handleSelectCommander(
      commanderRequest({ commanderId: "cmdr-blue" }),
      matchId,
      {
        db: handle.db,
        gameData: fixtureGameData(),
        resolveSession: async () => null,
      },
    );
    expect(response.status).toBe(401);
  });
});
