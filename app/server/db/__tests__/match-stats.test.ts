import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  fixtureGameData,
  TEST_MAP_ID,
} from "../../lifecycle/__tests__/fixtures";
import { getMatchStats, type StatsSeat } from "../queries/match-stats";
import { events } from "../schema/events";
import { matches } from "../schema/matches";
import { createTestDb, type TestDb } from "./harness";

/**
 * Battle statistics derived from the event log (M11-T2).
 *
 * The interesting part is **attribution**: two of the four figures name a unit
 * rather than a player, so ownership has to be reconstructed from the map's
 * starting units (`u1` → host, `u2` → guest in the fixture) plus every
 * `unit_produced` along the way.
 */

describe("getMatchStats", () => {
  let handle: TestDb;
  let matchId: string;
  const host = "player-host";
  const guest = "player-guest";
  const seats: StatsSeat[] = [
    { playerId: host, role: "host" },
    { playerId: guest, role: "guest" },
  ];

  beforeEach(async () => {
    handle = await createTestDb();
    await handle.applyMigrations();
    matchId = randomUUID();
    await handle.db.insert(matches).values({
      id: matchId,
      status: "completed",
      mapId: TEST_MAP_ID,
      settings: { fogEnabled: false, turnDeadline: "24h", dayLimit: null },
      invitationCode: "ABC234",
    });
  });

  afterEach(async () => {
    await handle.close();
  });

  async function log(entries: readonly { type: string; payload: unknown }[]) {
    await handle.db.insert(events).values(
      entries.map((entry, i) => ({
        matchId,
        sequence: i + 1,
        type: entry.type as never,
        payload: entry.payload,
      })),
    );
  }

  async function stats() {
    return getMatchStats(
      handle.db,
      matchId,
      TEST_MAP_ID,
      seats,
      fixtureGameData(),
    );
  }

  it("counts an empty log as an empty match, not as missing data", async () => {
    expect(await stats()).toEqual({
      [host]: { unitsLost: 0, damageDealt: 0, captures: 0, unitsBuilt: 0 },
      [guest]: { unitsLost: 0, damageDealt: 0, captures: 0, unitsBuilt: 0 },
    });
  });

  it("attributes builds and captures straight from their payloads", async () => {
    await log([
      { type: "unit_produced", payload: { unitId: "p1", ownerPlayerId: host } },
      { type: "unit_produced", payload: { unitId: "p2", ownerPlayerId: host } },
      {
        type: "unit_produced",
        payload: { unitId: "p3", ownerPlayerId: guest },
      },
      { type: "property_captured", payload: { newOwnerPlayerId: guest } },
      { type: "property_captured", payload: { newOwnerPlayerId: guest } },
    ]);

    const result = await stats();
    expect(result[host]).toMatchObject({ unitsBuilt: 2, captures: 0 });
    expect(result[guest]).toMatchObject({ unitsBuilt: 1, captures: 2 });
  });

  it("attributes a destroyed starting unit to the seat the map gave it", async () => {
    // `u1` belongs to player_1 (the host) and `u2` to player_2 (the guest);
    // neither event says so — only the map placement does.
    await log([
      { type: "unit_destroyed", payload: { unitId: "u1", reason: "combat" } },
      { type: "unit_destroyed", payload: { unitId: "u2", reason: "combat" } },
      { type: "cargo_destroyed", payload: { unitId: "u1" } },
    ]);

    const result = await stats();
    expect(result[host].unitsLost).toBe(2);
    expect(result[guest].unitsLost).toBe(1);
  });

  it("attributes a produced unit's later death to whoever built it", async () => {
    await log([
      {
        type: "unit_produced",
        payload: { unitId: "built", ownerPlayerId: guest },
      },
      {
        type: "unit_destroyed",
        payload: { unitId: "built", reason: "combat" },
      },
    ]);

    const result = await stats();
    expect(result[guest]).toMatchObject({ unitsBuilt: 1, unitsLost: 1 });
    expect(result[host].unitsLost).toBe(0);
  });

  it("credits damage to the attacker, counterattacks included", async () => {
    await log([
      {
        type: "unit_attacked",
        payload: { attackerUnitId: "u1", defenderUnitId: "u2", damage: 55 },
      },
      // The defender strikes back: the counter's damage belongs to *its* owner.
      {
        type: "unit_counterattacked",
        payload: { attackerUnitId: "u2", defenderUnitId: "u1", damage: 20 },
      },
    ]);

    const result = await stats();
    expect(result[host].damageDealt).toBe(55);
    expect(result[guest].damageDealt).toBe(20);
  });

  it("ignores an event naming a unit or player it cannot place", async () => {
    await log([
      { type: "unit_destroyed", payload: { unitId: "ghost" } },
      { type: "property_captured", payload: { newOwnerPlayerId: "stranger" } },
      {
        type: "unit_attacked",
        payload: { attackerUnitId: "ghost", damage: 9 },
      },
    ]);

    const result = await stats();
    expect(result[host]).toMatchObject({ unitsLost: 0, damageDealt: 0 });
    expect(result[guest]).toMatchObject({ captures: 0 });
  });
});
