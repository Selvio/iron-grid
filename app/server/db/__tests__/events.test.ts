import { asc } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { appendEvents, insertPlayerEvents } from "../queries/events";
import { events } from "../schema/events";
import { matchPlayers } from "../schema/match-players";
import { playerEvents } from "../schema/player-events";
import { createTestDb, type TestDb } from "./harness";
import { insertDraftMatch } from "./fixtures";

describe("event store", () => {
  let handle: TestDb;

  beforeEach(async () => {
    handle = await createTestDb();
    await handle.applyMigrations();
    await insertDraftMatch(handle);
  });

  afterEach(async () => {
    await handle.close();
  });

  it("assigns contiguous sequences from 1 across appends", async () => {
    const first = await appendEvents(handle.db, "match-1", [
      { type: "match_started", payload: {} },
      { type: "turn_started", payload: { day: 1 } },
    ]);
    const second = await appendEvents(handle.db, "match-1", [
      { type: "unit_moved", payload: { unitId: "u1" } },
    ]);

    expect(first.map((e) => e.sequence)).toEqual([1, 2]);
    expect(second.map((e) => e.sequence)).toEqual([3]);
    const stored = await handle.db
      .select()
      .from(events)
      .orderBy(asc(events.sequence));
    expect(stored.map((e) => e.type)).toEqual([
      "match_started",
      "turn_started",
      "unit_moved",
    ]);
    expect(stored[1].payload).toEqual({ day: 1 });
  });

  it("is a no-op for an empty append", async () => {
    const result = await appendEvents(handle.db, "match-1", []);
    expect(result).toEqual([]);
  });

  it("rejects a duplicate (match_id, sequence)", async () => {
    await appendEvents(handle.db, "match-1", [
      { type: "match_started", payload: {} },
    ]);
    await expect(
      handle.db.insert(events).values({
        matchId: "match-1",
        sequence: 1,
        type: "turn_started",
        payload: {},
      }),
    ).rejects.toThrow();
  });

  it("rejects an event for an unknown match", async () => {
    await expect(
      appendEvents(handle.db, "ghost", [
        { type: "match_started", payload: {} },
      ]),
    ).rejects.toThrow();
  });

  it("stores per-player projections keyed to the authoritative sequence", async () => {
    await handle.db.insert(matchPlayers).values({
      id: "p1",
      matchId: "match-1",
      role: "host",
    });
    await appendEvents(handle.db, "match-1", [
      { type: "unit_moved", payload: { unitId: "u1", to: { x: 3, y: 4 } } },
    ]);

    await insertPlayerEvents(handle.db, [
      {
        matchId: "match-1",
        playerId: "p1",
        sequence: 1,
        type: "unit_moved",
        payload: { unitId: "u1" }, // fog-filtered: destination omitted
      },
    ]);

    const [projection] = await handle.db.select().from(playerEvents);
    expect(projection).toMatchObject({
      playerId: "p1",
      sequence: 1,
      payload: { unitId: "u1" },
    });
  });
});
