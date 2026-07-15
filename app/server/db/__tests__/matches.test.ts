import { sql } from "drizzle-orm";
import type { MatchState } from "game-engine";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { persistMatchSnapshot } from "../queries/matches";
import { type MatchSettings, matches } from "../schema/matches";
import { createTestDb, type TestDb } from "./harness";

const SETTINGS: MatchSettings = {
  fogEnabled: false,
  turnDeadline: "24h",
  dayLimit: null,
};

/** A minimal active-match snapshot; overrides tune the mirrored meta fields. */
function makeState(overrides: Partial<MatchState["match"]> = {}): MatchState {
  return {
    match: {
      id: "match-1",
      status: "active",
      dataVersion: "test-v1",
      mapId: "map-1",
      stateVersion: 5,
      currentDay: 3,
      activePlayerId: "player-2",
      firstPlayerId: "player-1",
      startedAt: "2026-07-14T00:00:00.000Z",
      completedAt: null,
      winnerPlayerId: null,
      completionReason: null,
      turnDeadlineAt: "2026-07-20T12:00:00.000Z",
      expiredTurnClaimAvailableTo: null,
      deterministicSeed: "seed",
      randomSequenceIndex: 0,
      ...overrides,
    },
    players: [],
    units: [],
    properties: [],
    terrainObjects: [],
  };
}

async function insertDraft(handle: TestDb, id: string, invitationCode: string) {
  await handle.db.insert(matches).values({
    id,
    status: "draft",
    mapId: "map-1",
    settings: SETTINGS,
    invitationCode,
  });
}

describe("matches schema", () => {
  let handle: TestDb;

  beforeEach(async () => {
    handle = await createTestDb();
    await handle.applyMigrations();
  });

  afterEach(async () => {
    await handle.close();
  });

  it("round-trips a draft match with lifecycle defaults", async () => {
    await insertDraft(handle, "match-1", "ABC234");

    const [row] = await handle.db.select().from(matches);
    expect(row).toMatchObject({
      id: "match-1",
      status: "draft",
      settings: SETTINGS,
      stateVersion: 0,
      dayCounter: 0,
      gameDataVersion: null,
      randomSeed: null,
      state: null,
      activePlayerId: null,
      winnerPlayerId: null,
      completionReason: null,
    });
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it("rejects a duplicate invitation code", async () => {
    await insertDraft(handle, "match-1", "ABC234");
    await expect(insertDraft(handle, "match-2", "ABC234")).rejects.toThrow();
  });

  it("persists the snapshot and its mirrors atomically", async () => {
    await insertDraft(handle, "match-1", "ABC234");
    const state = makeState();

    await persistMatchSnapshot(handle.db, "match-1", state);

    const [row] = await handle.db.select().from(matches);
    expect(row.stateVersion).toBe(5);
    expect(row.activePlayerId).toBe("player-2");
    expect(row.dayCounter).toBe(3);
    expect(row.status).toBe("active");
    expect(row.turnDeadlineAt?.toISOString()).toBe("2026-07-20T12:00:00.000Z");
    expect(row.completedAt).toBeNull();
    // The full engine snapshot round-trips through the jsonb column.
    expect(row.state).toEqual(state);
  });

  it("mirrors a completed result from the snapshot", async () => {
    await insertDraft(handle, "match-1", "ABC234");
    const state = makeState({
      status: "completed",
      winnerPlayerId: "player-1",
      completionReason: "headquarters_captured",
      completedAt: "2026-07-21T09:30:00.000Z",
    });

    await persistMatchSnapshot(handle.db, "match-1", state);

    const [row] = await handle.db.select().from(matches);
    expect(row.status).toBe("completed");
    expect(row.winnerPlayerId).toBe("player-1");
    expect(row.completionReason).toBe("headquarters_captured");
    expect(row.completedAt?.toISOString()).toBe("2026-07-21T09:30:00.000Z");
  });

  it("creates the mirror/lookup indexes", async () => {
    const result = await handle.db.execute<{ indexname: string }>(
      sql`select indexname from pg_indexes where tablename = 'matches'`,
    );
    const names = result.rows.map((r) => r.indexname);
    expect(names).toEqual(
      expect.arrayContaining([
        "matches_invitation_code_key",
        "matches_status_idx",
        "matches_turn_deadline_at_idx",
        "matches_active_player_id_idx",
      ]),
    );
  });
});
