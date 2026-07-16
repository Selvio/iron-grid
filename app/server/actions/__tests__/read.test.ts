import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { fixtureGameData } from "../../lifecycle/__tests__/fixtures";
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
      you: { playerId: string; funds: number };
      opponent: Record<string, unknown>;
    };

    expect(view.status).toBe("active");
    expect(view.viewerPlayerId).toBe(active.hostPlayerId);
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

  it("returns 401 when unauthenticated", async () => {
    const response = await handleGetMatch(active.matchId, {
      db: active.handle.db,
      gameData: fixtureGameData(),
      resolveSession: async () => null,
    });
    expect(response.status).toBe(401);
  });
});
