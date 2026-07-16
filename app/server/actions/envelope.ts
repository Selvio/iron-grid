import { randomUUID } from "node:crypto";

import type { Action, Coordinate } from "game-engine";

import { InvalidActionError, UnsupportedActionError } from "./errors";

/**
 * Action envelope & payload validation (M7-T2).
 *
 * Parses an untrusted request body into a typed engine `Action` for the pipeline
 * (`action_processing.ordered_steps` step `validate_action_payload_schema`). It
 * checks the envelope (`expectedStateVersion`, `idempotencyKey`) and the
 * per-type payload **shape** — legality (paths, ranges, ownership) is the
 * engine's `validateAction` (step `validate_action_legality`), never the client's.
 *
 * `matchId` and `playerId` are **server-set** — `matchId` from the URL, `playerId`
 * from the authenticated membership — so a client can never act as another player
 * or match. `produce`'s `newUnitId` is **server-assigned** (like the seed), not
 * client-supplied (`actions.ts`). Gated types (`activate_power` §33.1) and the
 * not-yet-supported ones (`launch_missile`, `resign` until M7-T5, `claim_victory`
 * M8) are rejected with a typed error.
 *
 * @see packages/game-engine/src/actions.ts
 * @see docs/04-development/milestones/m7-actions.md (M7-T2)
 */

/** Server-provided context the client cannot set. */
export interface ActionContext {
  readonly matchId: string;
  /** The authenticated caller's `match_players.id` (from membership). */
  readonly playerId: string;
  /** Server id allocator for produced units; defaults to a random UUID. */
  readonly generateUnitId?: () => string;
}

/** The concurrency/idempotency envelope, validated before the typed payload. */
export interface ActionEnvelopeMeta {
  readonly expectedStateVersion: number;
  readonly idempotencyKey: string;
}

function asObject(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new InvalidActionError("Action body must be a JSON object.");
  }
  return input as Record<string, unknown>;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new InvalidActionError(`${field} must be a non-empty string.`);
  }
  return value;
}

function requireCoordinate(value: unknown, field: string): Coordinate {
  const c = value as { x?: unknown; y?: unknown } | null;
  if (
    typeof c !== "object" ||
    c === null ||
    !Number.isInteger(c.x) ||
    !Number.isInteger(c.y)
  ) {
    throw new InvalidActionError(
      `${field} must be an integer {x, y} coordinate.`,
    );
  }
  return { x: c.x as number, y: c.y as number };
}

function requirePath(value: unknown, field: string): Coordinate[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new InvalidActionError(
      `${field} must be a non-empty coordinate array.`,
    );
  }
  return value.map((c, i) => requireCoordinate(c, `${field}[${i}]`));
}

function optionalPath(value: unknown, field: string): Coordinate[] | undefined {
  return value === undefined ? undefined : requirePath(value, field);
}

/** Validates only the concurrency/idempotency envelope fields. */
export function parseActionEnvelope(input: unknown): ActionEnvelopeMeta {
  const body = asObject(input);
  if (
    typeof body.expectedStateVersion !== "number" ||
    !Number.isInteger(body.expectedStateVersion) ||
    body.expectedStateVersion < 0
  ) {
    throw new InvalidActionError(
      "expectedStateVersion must be a non-negative integer.",
    );
  }
  const idempotencyKey = requireString(body.idempotencyKey, "idempotencyKey");
  return { expectedStateVersion: body.expectedStateVersion, idempotencyKey };
}

/**
 * Parses an untrusted body into a typed `Action` with server-set `matchId` /
 * `playerId`.
 *
 * @throws {InvalidActionError} on a malformed envelope or payload.
 * @throws {UnsupportedActionError} on a gated or not-yet-supported action type.
 */
export function parseAction(input: unknown, context: ActionContext): Action {
  const body = asObject(input);
  const { expectedStateVersion, idempotencyKey } = parseActionEnvelope(body);
  const newUnitId = context.generateUnitId ?? randomUUID;

  const envelope = {
    matchId: context.matchId,
    playerId: context.playerId,
    expectedStateVersion,
    idempotencyKey,
  };

  const type = body.type;
  switch (type) {
    case "move_and_wait":
      return {
        ...envelope,
        type,
        unitId: requireString(body.unitId, "unitId"),
        path: requirePath(body.path, "path"),
      };
    case "attack":
      return {
        ...envelope,
        type,
        unitId: requireString(body.unitId, "unitId"),
        targetUnitId: requireString(body.targetUnitId, "targetUnitId"),
        path: optionalPath(body.path, "path"),
      };
    case "capture":
      return {
        ...envelope,
        type,
        unitId: requireString(body.unitId, "unitId"),
        path: optionalPath(body.path, "path"),
      };
    case "produce":
      return {
        ...envelope,
        type,
        propertyId: requireString(body.propertyId, "propertyId"),
        unitTypeId: requireString(body.unitTypeId, "unitTypeId"),
        newUnitId: newUnitId(),
      };
    case "supply":
      return {
        ...envelope,
        type,
        unitId: requireString(body.unitId, "unitId"),
        path: optionalPath(body.path, "path"),
      };
    case "join":
      return {
        ...envelope,
        type,
        unitId: requireString(body.unitId, "unitId"),
        path: requirePath(body.path, "path"),
      };
    case "load":
      return {
        ...envelope,
        type,
        unitId: requireString(body.unitId, "unitId"),
        path: requirePath(body.path, "path"),
      };
    case "unload":
      return {
        ...envelope,
        type,
        unitId: requireString(body.unitId, "unitId"),
        path: optionalPath(body.path, "path"),
        unloads: requireUnloads(body.unloads),
      };
    case "dive":
      return {
        ...envelope,
        type,
        unitId: requireString(body.unitId, "unitId"),
      };
    case "surface":
      return {
        ...envelope,
        type,
        unitId: requireString(body.unitId, "unitId"),
      };
    case "end_turn":
    case "resign":
      return { ...envelope, type };
    case "activate_power":
      // §33.1: commander effects/power are design-blocked until commanders.yaml.
      throw new UnsupportedActionError(
        "Commander powers are not available yet.",
      );
    case "claim_victory":
    case "launch_missile":
      // claim_victory + deadlines are M8; launch_missile is §33.3-gated.
      throw new UnsupportedActionError();
    default:
      throw new InvalidActionError(`Unknown action type: ${String(type)}.`);
  }
}

/** Validates the `unload` cargo list. */
function requireUnloads(
  value: unknown,
): { cargoUnitId: string; to: Coordinate }[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new InvalidActionError("unloads must be a non-empty array.");
  }
  return value.map((entry, i) => {
    const u = asObject(entry);
    return {
      cargoUnitId: requireString(u.cargoUnitId, `unloads[${i}].cargoUnitId`),
      to: requireCoordinate(u.to, `unloads[${i}].to`),
    };
  });
}
