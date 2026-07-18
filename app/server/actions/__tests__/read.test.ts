import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { matchPlayers } from "../../db/schema/match-players";
import { matches } from "../../db/schema/matches";
import {
  fixtureGameData,
  TEST_MAP_ID,
} from "../../lifecycle/__tests__/fixtures";
import { handleGetEvents, handleGetMatch } from "../read";
import {
  activateFixtureMatch,
  sessionFor,
  type ActiveMatch,
} from "./active-match";

describe("read endpoints", () => {
  let active: ActiveMatch;

  beforeEach(async () => {
    active = await activateFixtureMatch();
  });

  afterEach(async () => {
    await active.handle.close();
  });

  function deps(userId: string) {
    return {
      db: active.handle.db,
      gameData: fixtureGameData(),
      resolveSession: sessionFor(userId),
    };
  }

  it("returns the caller's projected match view with private economy", async () => {
    const response = await handleGetMatch(active.matchId, deps(active.hostId));
    expect(response.status).toBe(200);
    const view = (await response.json()) as {
      status: string;
      viewerPlayerId: string;
      units: unknown[];
      visibleTiles: unknown[];
      map: { width: number; height: number; logicalTerrain: string[][] };
      unitRender: Record<string, { spriteRow: number; isAir: boolean }>;
      you: { playerId: string; funds: number };
      opponent: Record<string, unknown>;
    };

    expect(view.status).toBe("active");
    expect(view.viewerPlayerId).toBe(active.hostPlayerId);
    // The public map layout is included so the battlefield can render terrain.
    expect(view.map.width).toBeGreaterThan(0);
    expect(view.map.logicalTerrain).toHaveLength(view.map.height);
    expect(view.map.logicalTerrain[0]).toHaveLength(view.map.width);
    // Fog is off → every tile is visible (no shroud darkens the board).
    expect(view.visibleTiles).toHaveLength(view.map.width * view.map.height);
    // Static sprite metadata for the client (it cannot load game data).
    expect(Object.keys(view.unitRender).length).toBeGreaterThan(0);
    // Fog is off in the fixture → both starting units are visible.
    expect(view.units).toHaveLength(2);
    expect(view.you.playerId).toBe(active.hostPlayerId);
    expect(typeof view.you.funds).toBe("number");
    // The opponent's private economy is never exposed.
    expect(view.opponent.playerId).toBe(active.guestPlayerId);
    expect(view.opponent).not.toHaveProperty("funds");
    expect(view.opponent).not.toHaveProperty("powerMeter");
  });

  it("returns the viewer's events, filtered by since", async () => {
    const all = await handleGetMatch(active.matchId, deps(active.hostId)); // warm-up
    expect(all.status).toBe(200);

    const response = await handleGetEvents(
      active.matchId,
      0,
      deps(active.hostId),
    );
    const body = (await response.json()) as {
      events: { sequence: number; type: string }[];
    };
    expect(body.events.length).toBeGreaterThan(0);
    expect(body.events.every((e) => e.sequence > 0)).toBe(true);
    // Ordered ascending.
    const seqs = body.events.map((e) => e.sequence);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);

    // A high `since` returns nothing.
    const empty = await handleGetEvents(
      active.matchId,
      9999,
      deps(active.hostId),
    );
    expect((await empty.json()).events).toHaveLength(0);
  });

  it("rejects a non-member with 403 on both reads", async () => {
    expect(
      (await handleGetMatch(active.matchId, deps(active.outsiderId))).status,
    ).toBe(403);
    expect(
      (await handleGetEvents(active.matchId, 0, deps(active.outsiderId)))
        .status,
    ).toBe(403);
  });

  it("returns a board-less view for a pre-active match", async () => {
    // A commander_selection match has no engine state yet.
    const pendingId = randomUUID();
    await active.handle.db.insert(matches).values({
      id: pendingId,
      status: "commander_selection",
      mapId: TEST_MAP_ID,
      settings: { fogEnabled: false, turnDeadline: "24h", dayLimit: null },
      invitationCode: "PEND22",
    });
    await active.handle.db.insert(matchPlayers).values({
      id: randomUUID(),
      matchId: pendingId,
      userId: active.hostId,
      role: "host",
    });

    const response = await handleGetMatch(pendingId, deps(active.hostId));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string; board: null };
    expect(body.status).toBe("commander_selection");
    expect(body.board).toBeNull();
  });

  it("returns 401 when unauthenticated", async () => {
    const response = await handleGetMatch(active.matchId, {
      db: active.handle.db,
      gameData: fixtureGameData(),
      resolveSession: async () => null,
    });
    expect(response.status).toBe(401);
  });
});
