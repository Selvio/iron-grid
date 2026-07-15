import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { matchPlayers, type NewMatchPlayerRow } from "../schema/match-players";
import { createTestDb, type TestDb } from "./harness";
import { insertDraftMatch } from "./fixtures";

function player(overrides: Partial<NewMatchPlayerRow>): NewMatchPlayerRow {
  return {
    id: "player-1",
    matchId: "match-1",
    role: "host",
    factionId: "blue",
    commanderId: "commander-a",
    ...overrides,
  };
}

describe("match_players schema", () => {
  let handle: TestDb;

  beforeEach(async () => {
    handle = await createTestDb();
    await handle.applyMigrations();
    await insertDraftMatch(handle);
  });

  afterEach(async () => {
    await handle.close();
  });

  it("stores host and guest with distinct faction and commander", async () => {
    await handle.db
      .insert(matchPlayers)
      .values([
        player({ id: "p1", role: "host", factionId: "blue", commanderId: "a" }),
        player({
          id: "p2",
          role: "guest",
          factionId: "green",
          commanderId: "b",
        }),
      ]);

    const rows = await handle.db.select().from(matchPlayers);
    expect(rows).toHaveLength(2);
    const host = rows.find((r) => r.id === "p1");
    expect(host).toMatchObject({ role: "host", isReady: false, userId: null });
  });

  it("rejects two players sharing a faction in one match", async () => {
    await handle.db.insert(matchPlayers).values(player({ id: "p1" }));
    await expect(
      handle.db
        .insert(matchPlayers)
        .values(player({ id: "p2", commanderId: "b" })),
    ).rejects.toThrow();
  });

  it("rejects two players sharing a commander in one match", async () => {
    await handle.db.insert(matchPlayers).values(player({ id: "p1" }));
    await expect(
      handle.db
        .insert(matchPlayers)
        .values(player({ id: "p2", factionId: "green" })),
    ).rejects.toThrow();
  });

  it("allows the same faction and commander across different matches", async () => {
    await insertDraftMatch(handle, "match-2", "XYZ789");
    await handle.db
      .insert(matchPlayers)
      .values([
        player({ id: "p1", matchId: "match-1" }),
        player({ id: "p2", matchId: "match-2" }),
      ]);

    const rows = await handle.db.select().from(matchPlayers);
    expect(rows).toHaveLength(2);
  });

  it("permits multiple unselected (null faction/commander) rows per match", async () => {
    await handle.db
      .insert(matchPlayers)
      .values([
        player({ id: "p1", role: "host", factionId: null, commanderId: null }),
        player({ id: "p2", role: "guest", factionId: null, commanderId: null }),
      ]);

    const rows = await handle.db
      .select()
      .from(matchPlayers)
      .where(eq(matchPlayers.matchId, "match-1"));
    expect(rows).toHaveLength(2);
  });

  it("rejects a player referencing a nonexistent match", async () => {
    await expect(
      handle.db
        .insert(matchPlayers)
        .values(player({ id: "p1", matchId: "ghost" })),
    ).rejects.toThrow();
  });
});
