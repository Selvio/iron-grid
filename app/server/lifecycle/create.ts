import { randomUUID } from "node:crypto";

import type { GameData } from "game-data";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";

import { requireUser } from "../auth/session";
import { matchPlayers } from "../db/schema/match-players";
import { matches, type MatchSettings } from "../db/schema/matches";

import type { LifecycleDeps } from "./deps";
import { InvalidMatchSettingsError } from "./errors";
import { errorResponse } from "./http";
import { generateUniqueInvitationCode } from "./invitation-code";
import {
  defaultInvitationRateLimiter,
  type InvitationRateLimiter,
} from "./rate-limit";

/**
 * `POST /api/matches` — create a match and publish its invitation (M6-T2).
 *
 * `requireUser`-authenticated (the caller becomes host — no membership exists
 * yet, §3). Validates the host settings against `creation.allowed_configuration`,
 * generates a unique unambiguous invitation code, and inserts the `matches` row
 * (durably `waiting_for_opponent` — creation publishes, there is no separate
 * publish endpoint, §3) plus the host `match_players` row in one transaction.
 * Invitation rate limiting applies (`security_rules`).
 *
 * @see docs/03-architecture/backend.md §3
 * @see docs/02-data/rules.yaml → match_lifecycle.creation
 * @see docs/04-development/milestones/m6-lifecycle.md (M6-T2)
 */

/** Host turn-deadline options (`MatchSettings.turnDeadline`). */
const TURN_DEADLINES: readonly MatchSettings["turnDeadline"][] = [
  "24h",
  "3d",
  "7d",
  "none",
];

export interface CreateMatchDeps<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
> extends LifecycleDeps<TQuery, TSchema> {
  /** Reference data — the `maps` a `map_id` is validated against. */
  readonly gameData: GameData;
  /** Invitation rate limiter (defaults to the process-wide limiter). */
  readonly rateLimiter?: InvitationRateLimiter;
}

/** A validated create-match request: the chosen map and host settings. */
export interface CreateMatchInput {
  readonly mapId: string;
  readonly settings: MatchSettings;
}

/**
 * Validates a raw create body into `{ mapId, settings }`.
 *
 * `map_id` must resolve to a known map; settings must be exactly the
 * host-configurable fields with well-typed values. Unknown maps and malformed
 * settings are rejected — the fixed gameplay configuration is never client-set.
 *
 * @throws {InvalidMatchSettingsError} on any malformed or unknown input.
 */
export function parseCreateMatchBody(
  input: unknown,
  gameData: GameData,
): CreateMatchInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new InvalidMatchSettingsError("Body must be a JSON object.");
  }
  const body = input as Record<string, unknown>;

  if (
    typeof body.mapId !== "string" ||
    gameData.maps[body.mapId] === undefined
  ) {
    throw new InvalidMatchSettingsError("Unknown or missing map id.");
  }

  const settings = body.settings;
  if (typeof settings !== "object" || settings === null) {
    throw new InvalidMatchSettingsError("Missing match settings.");
  }
  const s = settings as Record<string, unknown>;

  if (typeof s.fogEnabled !== "boolean") {
    throw new InvalidMatchSettingsError(
      "settings.fogEnabled must be a boolean.",
    );
  }
  if (
    typeof s.turnDeadline !== "string" ||
    !TURN_DEADLINES.includes(s.turnDeadline as MatchSettings["turnDeadline"])
  ) {
    throw new InvalidMatchSettingsError("settings.turnDeadline is invalid.");
  }
  const dayLimit = s.dayLimit;
  if (
    dayLimit !== null &&
    (typeof dayLimit !== "number" ||
      !Number.isInteger(dayLimit) ||
      dayLimit <= 0)
  ) {
    throw new InvalidMatchSettingsError(
      "settings.dayLimit must be null or a positive integer.",
    );
  }

  return {
    mapId: body.mapId,
    settings: {
      fogEnabled: s.fogEnabled,
      turnDeadline: s.turnDeadline as MatchSettings["turnDeadline"],
      dayLimit: dayLimit as number | null,
    },
  };
}

/** Handles a create-match request end-to-end, returning the typed response. */
export async function handleCreateMatch<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(request: Request, deps: CreateMatchDeps<TQuery, TSchema>): Promise<Response> {
  try {
    const user = await requireUser(deps.resolveSession);
    (deps.rateLimiter ?? defaultInvitationRateLimiter).check(user.id);

    const body = await request.json().catch(() => {
      throw new InvalidMatchSettingsError("Body must be valid JSON.");
    });
    const { mapId, settings } = parseCreateMatchBody(body, deps.gameData);

    const matchId = randomUUID();
    const invitationCode = await generateUniqueInvitationCode(deps.db);

    await deps.db.transaction(async (tx) => {
      await tx.insert(matches).values({
        id: matchId,
        status: "waiting_for_opponent",
        mapId,
        settings,
        invitationCode,
      });
      await tx.insert(matchPlayers).values({
        id: randomUUID(),
        matchId,
        userId: user.id,
        role: "host",
      });
    });

    return Response.json(
      { matchId, invitationCode, status: "waiting_for_opponent" },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
