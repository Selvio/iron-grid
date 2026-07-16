import { randomUUID } from "node:crypto";

import type { Session } from "next-auth";

import { matchPlayers } from "../../db/schema/match-players";
import { matches } from "../../db/schema/matches";
import { users } from "../../db/schema/users";
import { createTestDb, type TestDb } from "../../db/__tests__/harness";
import {
  fixtureGameData,
  TEST_MAP_ID,
} from "../../lifecycle/__tests__/fixtures";
import { handleReadyMatch } from "../../lifecycle/ready";

/**
 * Activates a fixture match through the real M6 ready path, so action-pipeline
 * tests run against a genuine persisted `MatchState` (M7-T3).
 */
export interface ActiveMatch {
  readonly handle: TestDb;
  readonly matchId: string;
  readonly hostId: string;
  readonly guestId: string;
  readonly outsiderId: string;
  /** The host's `match_players.id` — the server-random first (active) player. */
  readonly hostPlayerId: string;
  readonly guestPlayerId: string;
}

export function sessionFor(userId: string): () => Promise<Session | null> {
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

/** Spins up a migrated DB with one active match; host is the active player. */
export async function activateFixtureMatch(): Promise<ActiveMatch> {
  const handle = await createTestDb();
  await handle.applyMigrations();

  const hostId = await insertUser(handle, "host@example.edu");
  const guestId = await insertUser(handle, "guest@example.edu");
  const outsiderId = await insertUser(handle, "outsider@example.edu");
  const matchId = randomUUID();
  const hostPlayerId = randomUUID();
  const guestPlayerId = randomUUID();

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
      id: guestPlayerId,
      matchId,
      userId: guestId,
      role: "guest",
      factionId: "red",
      commanderId: "cmdr-red",
      isReady: false,
    },
  ]);

  const readyDeps = (userId: string) => ({
    db: handle.db,
    gameData: fixtureGameData(),
    resolveSession: sessionFor(userId),
    now: () => new Date("2026-07-16T12:00:00.000Z"),
    // Host is the deterministic first (active) player.
    chooseFirstPlayer: () => hostPlayerId,
    generateSeed: () => "fixed-seed",
  });

  const readyRequest = () =>
    new Request("https://iron-grid.test/api/matches/m/ready", {
      method: "POST",
    });

  await handleReadyMatch(readyRequest(), matchId, readyDeps(hostId));
  await handleReadyMatch(readyRequest(), matchId, readyDeps(guestId));

  return {
    handle,
    matchId,
    hostId,
    guestId,
    outsiderId,
    hostPlayerId,
    guestPlayerId,
  };
}
