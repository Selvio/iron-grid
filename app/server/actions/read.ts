import { and, asc, eq, gt } from "drizzle-orm";
import {
  projectStateForPlayer,
  type CompletionReason,
  type MatchState,
} from "game-engine";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";

import { requireMatchMembership } from "../auth/membership";
import { requireUser } from "../auth/session";
import { matches } from "../db/schema/matches";
import { playerEvents } from "../db/schema/player-events";

import type { ActionDeps } from "./deps";
import { errorResponse } from "./http";

/**
 * Player-projected read endpoints (M7-T6).
 *
 * `GET /api/matches/:id` returns the caller's fog-filtered view of the match
 * (`projectStateForPlayer` — hidden enemy units and the opponent's private funds
 * never appear), and `GET /api/matches/:id/events?since=` returns the viewer's
 * own `player_events` after a sequence (replay reads projections, never the
 * authoritative `events`; `backend.md` §6, `replay_rules`). Both compose
 * `requireUser` + `requireMatchMembership`, so only the host and accepted guest
 * can read.
 *
 * @see docs/03-architecture/backend.md §6
 * @see docs/03-architecture/domain-model.md §13
 * @see docs/04-development/milestones/m7-actions.md (M7-T6)
 */

/** A player's own, private state (funds/powerMeter are not shown to the opponent). */
interface OwnPlayerView {
  readonly playerId: string;
  readonly factionId: string;
  readonly commanderId: string;
  readonly funds: number;
  readonly powerMeter: number;
  readonly resigned: boolean;
}

/** The opponent's public state — identity only, no private economy. */
interface OpponentView {
  readonly playerId: string;
  readonly factionId: string;
  readonly commanderId: string;
  readonly resigned: boolean;
}

/** The public map terrain the client renders (fog hides units, not the layout). */
export interface MapView {
  readonly width: number;
  readonly height: number;
  /** Row-major logical terrain ids; the client maps these to render tiles. */
  readonly logicalTerrain: readonly (readonly string[])[];
}

/** Static render metadata per unit type — the client cannot load game data. */
export interface UnitRenderMeta {
  /** The sprite family in the client's atlas (surfaced one for a submarine). */
  readonly spriteKey: string;
  /** The submerged sprite family for a submarine, else null. */
  readonly submergedSpriteKey: string | null;
  /** Air units are elevated and cast a shadow. */
  readonly isAir: boolean;
}

/** Builds the typeId → render-meta table for every MVP unit. */
function unitRenderTable(
  gameData: Parameters<typeof projectStateForPlayer>[2],
): Record<string, UnitRenderMeta> {
  const table: Record<string, UnitRenderMeta> = {};
  for (const [typeId, unit] of Object.entries(gameData.units)) {
    if (!unit.enabled_in_mvp) continue;
    const rendering = unit.rendering;
    table[typeId] =
      "sprite_keys" in rendering
        ? {
            spriteKey: rendering.sprite_keys.surfaced,
            submergedSpriteKey: rendering.sprite_keys.submerged,
            isAir: unit.category === "air",
          }
        : {
            spriteKey: rendering.sprite_key,
            submergedSpriteKey: null,
            isAir: unit.category === "air",
          };
  }
  return table;
}

/** The full read response for one viewer (`domain-model.md` §13). */
export interface MatchView {
  readonly matchId: string;
  readonly status: MatchState["match"]["status"];
  readonly currentDay: number;
  readonly stateVersion: number;
  readonly activePlayerId: string;
  readonly turnDeadlineAt: string | null;
  readonly viewerPlayerId: string;
  /** The map id, so the client can key game data for in-browser previews. */
  readonly mapId: string;
  /** The map layout to render (public); the battlefield draws terrain from it. */
  readonly map: MapView;
  /** Static per-type sprite metadata the client cannot derive itself. */
  readonly unitRender: Record<string, UnitRenderMeta>;
  readonly visibleTiles: ReturnType<
    typeof projectStateForPlayer
  >["visibleTiles"];
  readonly units: ReturnType<typeof projectStateForPlayer>["units"];
  readonly properties: ReturnType<typeof projectStateForPlayer>["properties"];
  readonly you: OwnPlayerView | null;
  readonly opponent: OpponentView | null;
  /** Set once the match completes — public, so the completed screen can read it. */
  readonly winnerPlayerId: string | null;
  readonly completionReason: CompletionReason | null;
}

/** Projects a match state into the viewer's fog-filtered, privacy-safe view. */
export function projectMatchView(
  state: MatchState,
  viewerPlayerId: string,
  gameData: Parameters<typeof projectStateForPlayer>[2],
): MatchView {
  const view = projectStateForPlayer(state, viewerPlayerId, gameData);
  const you = state.players.find((p) => p.playerId === viewerPlayerId);
  const opponent = state.players.find((p) => p.playerId !== viewerPlayerId);
  const map = gameData.maps[state.match.mapId];
  return {
    matchId: state.match.id,
    status: state.match.status,
    currentDay: state.match.currentDay,
    stateVersion: state.match.stateVersion,
    activePlayerId: state.match.activePlayerId,
    turnDeadlineAt: state.match.turnDeadlineAt,
    viewerPlayerId,
    mapId: state.match.mapId,
    map: {
      width: map.dimensions.width,
      height: map.dimensions.height,
      logicalTerrain: map.logical_terrain,
    },
    unitRender: unitRenderTable(gameData),
    visibleTiles: view.visibleTiles,
    units: view.units,
    properties: view.properties,
    you: you
      ? {
          playerId: you.playerId,
          factionId: you.factionId,
          commanderId: you.commanderId,
          funds: you.funds,
          powerMeter: you.powerMeter,
          resigned: you.resigned,
        }
      : null,
    opponent: opponent
      ? {
          playerId: opponent.playerId,
          factionId: opponent.factionId,
          commanderId: opponent.commanderId,
          resigned: opponent.resigned,
        }
      : null,
    winnerPlayerId: state.match.winnerPlayerId,
    completionReason: state.match.completionReason,
  };
}

/** `GET /api/matches/:id` — the caller's projected match view. */
export async function handleGetMatch<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(matchId: string, deps: ActionDeps<TQuery, TSchema>): Promise<Response> {
  try {
    const user = await requireUser(deps.resolveSession);

    const [row] = await deps.db
      .select({ status: matches.status, state: matches.state })
      .from(matches)
      .where(eq(matches.id, matchId));

    // Prefer the active player's row so a practice/hotseat match (same user on
    // both sides) is projected for whichever side is active; membership still
    // gates before any state is returned.
    const membership = await requireMatchMembership(
      deps.db,
      user.id,
      matchId,
      row?.state?.match.activePlayerId,
    );

    // A pre-active match has no engine state yet — return status only.
    if (row === undefined || row.state === null) {
      return Response.json({
        matchId,
        status: row?.status ?? null,
        board: null,
      });
    }
    return Response.json(
      projectMatchView(row.state, membership.playerId, deps.gameData),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** `GET /api/matches/:id/events?since=` — the viewer's projected events. */
export async function handleGetEvents<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(
  matchId: string,
  since: number,
  deps: ActionDeps<TQuery, TSchema>,
): Promise<Response> {
  try {
    const user = await requireUser(deps.resolveSession);
    const membership = await requireMatchMembership(deps.db, user.id, matchId);

    const rows = await deps.db
      .select({
        sequence: playerEvents.sequence,
        type: playerEvents.type,
        payload: playerEvents.payload,
      })
      .from(playerEvents)
      .where(
        and(
          eq(playerEvents.matchId, matchId),
          eq(playerEvents.playerId, membership.playerId),
          gt(playerEvents.sequence, since),
        ),
      )
      .orderBy(asc(playerEvents.sequence));

    return Response.json({ matchId, events: rows });
  } catch (error) {
    return errorResponse(error);
  }
}
