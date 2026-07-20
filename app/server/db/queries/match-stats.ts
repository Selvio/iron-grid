import { asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { GameData } from "game-data";

import { events } from "../schema/events";

/**
 * Per-player battle statistics for the completed screen (M11-T2).
 *
 * Derived from the authoritative event log rather than stored: the log already
 * carries every resolved outcome (`replay_rules`), so a summary computed from it
 * cannot drift from what actually happened, and no new column has to be kept in
 * lockstep. Only aggregate counts leave this function — never the events — so a
 * finished match discloses nothing beyond the summary both players are entitled
 * to.
 *
 * Two of the four figures are attributable straight from their payload
 * (`unit_produced.ownerPlayerId`, `property_captured.newOwnerPlayerId`). The
 * other two name a unit, not a player, so ownership is reconstructed: the map's
 * `starting_units` carry a slot (`player_1` / `player_2`), which
 * `buildRoster` assigns as host → `player_1` and guest → `player_2`, and every
 * later unit announces its owner when produced.
 *
 * **Scoring is deliberately absent.** Ranks and weighted scores are blocked
 * (`rules.yaml` → `day_limit_scoring`, §23.4/§33.2); these are counts of things
 * that demonstrably happened, not a score.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T7)
 */

/** What one player did over the course of the match. */
export interface MatchPlayerStats {
  readonly unitsLost: number;
  readonly damageDealt: number;
  readonly captures: number;
  readonly unitsBuilt: number;
}

/** The seat identity this aggregation needs to attribute a starting unit. */
export interface StatsSeat {
  readonly playerId: string;
  readonly role: "host" | "guest";
}

const EMPTY: MatchPlayerStats = {
  unitsLost: 0,
  damageDealt: 0,
  captures: 0,
  unitsBuilt: 0,
};

/** `player_1` for the host, `player_2` for the guest — see `buildRoster`. */
function slotOf(role: "host" | "guest"): string {
  return role === "host" ? "player_1" : "player_2";
}

function read(payload: unknown, key: string): string | undefined {
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

export async function getMatchStats<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(
  db: PgDatabase<TQuery, TSchema>,
  matchId: string,
  mapId: string,
  seats: readonly StatsSeat[],
  gameData: GameData,
): Promise<Record<string, MatchPlayerStats>> {
  const rows = await db
    .select({ type: events.type, payload: events.payload })
    .from(events)
    .where(eq(events.matchId, matchId))
    .orderBy(asc(events.sequence));

  const totals = new Map<string, MatchPlayerStats>(
    seats.map((seat) => [seat.playerId, { ...EMPTY }]),
  );
  const add = (
    playerId: string | undefined,
    patch: Partial<MatchPlayerStats>,
  ): void => {
    if (playerId === undefined) return;
    const current = totals.get(playerId);
    if (current === undefined) return; // an id no longer seated: ignore, never invent
    totals.set(playerId, {
      unitsLost: current.unitsLost + (patch.unitsLost ?? 0),
      damageDealt: current.damageDealt + (patch.damageDealt ?? 0),
      captures: current.captures + (patch.captures ?? 0),
      unitsBuilt: current.unitsBuilt + (patch.unitsBuilt ?? 0),
    });
  };

  // Who owned what. Seeded with the units the map placed, then extended as the
  // log announces each production.
  const ownerOfUnit = new Map<string, string>();
  const bySlot = new Map(
    seats.map((seat) => [slotOf(seat.role), seat.playerId]),
  );
  for (const placement of gameData.maps[mapId]?.starting_units ?? []) {
    const playerId = bySlot.get(placement.owner);
    if (playerId !== undefined) ownerOfUnit.set(placement.id, playerId);
  }

  for (const row of rows) {
    const payload = row.payload;
    switch (row.type) {
      case "unit_produced": {
        const owner = read(payload, "ownerPlayerId");
        const unitId = read(payload, "unitId");
        if (owner !== undefined && unitId !== undefined) {
          ownerOfUnit.set(unitId, owner);
        }
        add(owner, { unitsBuilt: 1 });
        break;
      }
      case "property_captured":
        add(read(payload, "newOwnerPlayerId"), { captures: 1 });
        break;
      case "unit_destroyed":
      case "cargo_destroyed":
        add(ownerOfUnit.get(read(payload, "unitId") ?? ""), { unitsLost: 1 });
        break;
      case "unit_attacked":
      case "unit_counterattacked": {
        const damage = (payload as { damage?: unknown }).damage;
        if (typeof damage === "number") {
          add(ownerOfUnit.get(read(payload, "attackerUnitId") ?? ""), {
            damageDealt: damage,
          });
        }
        break;
      }
      default:
        break;
    }
  }

  return Object.fromEntries(totals);
}
