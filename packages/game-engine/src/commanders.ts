/**
 * The declarative commander-modifier resolver and the power-meter / `activate_
 * power` skeleton (§22.4–§22.5; `rules.yaml`, `commanders.yaml`).
 *
 * **Passives are live** (ADR-0006): the four approved passives in
 * `commanders.yaml` are applied here, gated on `passive.status === "approved"` so
 * an unresolved design can never leak into play. **Powers are still blocked**
 * (§22.6): every `power.cost` is null, so activation always fails, and the
 * CO-meter **charge formula** (§22.5, §33.5) remains gated — this module adds no
 * charge logic, so the meter never grows here. Powers apply only declarative data
 * (vacuous today), never hardcoded name checks (§22.4). Draws no randomness.
 *
 * @see docs/decisions/0006-commander-passive-effects.md
 * @see docs/02-data/commanders.yaml
 * @see docs/01-specification/game-specification.md §22
 * @see docs/04-development/milestones/m3-combat-systems-fog.md (M3-T8)
 */

import type { GameData } from "game-data";

import type { ActivatePowerAction } from "./actions";
import { playerById, updatePlayer } from "./board";
import type { EngineResult, ValidationError, ValidationResult } from "./engine";
import type { Event } from "./events";
import type { Id, MatchState } from "./state";

type Commander = NonNullable<GameData["commanders"]["commanders"][string]>;
type Modifier = Commander["passive"]["modifiers"][number];
/** A gameplay attribute a commander modifier may target (`commanders.yaml`). */
export type ModifierTarget = Modifier["target"];

/** What a modifier's scope is matched against for a specific application. */
interface ModifierContext {
  readonly unitTypeId?: string;
  readonly unitCategory?: string;
  readonly movementType?: string;
  /** The tile the effect is resolved on — the attacker's or the defender's. */
  readonly terrainId?: string;
}

/** Resolve a match's commander for a given id, tolerating absent commander data. */
function commanderById(
  gameData: GameData,
  commanderId: string,
): Commander | undefined {
  const commanders = (
    gameData as {
      commanders?: { commanders?: Record<string, Commander> };
    }
  ).commanders?.commanders;
  return commanders?.[commanderId];
}

/** Whether a modifier's scope applies in `ctx` (§22.4 declarative scopes). */
function scopeMatches(scope: Modifier["scope"], ctx: ModifierContext): boolean {
  switch (scope.type) {
    case "all_units":
      return true;
    case "unit_ids":
      return (
        ctx.unitTypeId !== undefined && scope.values.includes(ctx.unitTypeId)
      );
    case "unit_categories":
      return (
        ctx.unitCategory !== undefined &&
        scope.values.includes(ctx.unitCategory)
      );
    case "movement_types":
      return (
        ctx.movementType !== undefined &&
        scope.values.includes(ctx.movementType)
      );
    case "terrain_ids":
      // The caller decides *which* tile is being resolved on (ADR-0006): the
      // attacker's for `attack`, the defender's for `defense`/terrain stars.
      return (
        ctx.terrainId !== undefined && scope.values.includes(ctx.terrainId)
      );
    default:
      // property_ids scopes are not wired to these targets yet.
      return false;
  }
}

/** Sum the additive passive modifiers of `commander` for `target` in `ctx`. */
function sumModifiers(
  commander: Commander,
  target: ModifierTarget,
  ctx: ModifierContext,
): number {
  // The passive gate (ADR-0006): only an approved passive applies. A commander
  // whose design is still unresolved contributes nothing, whatever its data says.
  if (commander.passive.status !== "approved") return 0;
  let total = 0;
  for (const m of commander.passive.modifiers) {
    if (m.target !== target || m.operation !== "add") continue;
    if (!scopeMatches(m.scope, ctx)) continue;
    total += m.value;
  }
  return total;
}

/**
 * The additive commander modifier a player applies to `target`, optionally scoped
 * to the unit `unitTypeId` and to the tile the effect resolves on. Zero when the
 * player has no commander, or when that commander's passive is not approved.
 */
export function ownerModifier(
  state: MatchState,
  ownerPlayerId: Id,
  gameData: GameData,
  target: ModifierTarget,
  unitTypeId?: string,
  terrainId?: string,
): number {
  const player = playerById(state, ownerPlayerId);
  if (player === undefined) return 0;
  const commander = commanderById(gameData, player.commanderId);
  if (commander === undefined) return 0;

  const unitDef =
    unitTypeId === undefined ? undefined : gameData.units[unitTypeId];
  return sumModifiers(commander, target, {
    unitTypeId,
    unitCategory: unitDef?.category,
    movementType: unitDef?.movement.type,
    terrainId,
  });
}

/**
 * Validate an `activate_power` (§22.5): active player, a resolved power, and
 * enough meter to pay its cost. With the disabled commander data the power cost
 * is null, so activation is never legal until §22.6 resolves the power design.
 */
export function validateActivatePower(
  state: MatchState,
  action: ActivatePowerAction,
  gameData: GameData,
): ValidationResult {
  const errors: ValidationError[] = [];
  const done = (): ValidationResult =>
    errors.length === 0 ? { valid: true } : { valid: false, errors };

  if (state.match.status !== "active")
    errors.push({ code: "match_not_active" });
  if (action.playerId !== state.match.activePlayerId) {
    errors.push({ code: "not_active_player" });
  }

  const player = playerById(state, action.playerId);
  const commander =
    player === undefined
      ? undefined
      : commanderById(gameData, player.commanderId);
  const cost = commander?.power.cost ?? null;
  if (player === undefined || commander === undefined || cost === null) {
    errors.push({ code: "power_not_ready" });
    return done();
  }
  if (player.powerMeter < cost) errors.push({ code: "power_not_ready" });

  return done();
}

/**
 * Apply a validated `activate_power`: spend the meter cost and emit
 * `power_activated`. Declarative power effects are applied only from data
 * (vacuous today); no charge logic runs (the meter only ever decreases here).
 */
export function applyActivatePower(
  state: MatchState,
  action: ActivatePowerAction,
  gameData: GameData,
): EngineResult {
  const player = playerById(state, action.playerId)!;
  const commander = commanderById(gameData, player.commanderId)!;
  const cost = commander.power.cost ?? 0;

  const nextState = updatePlayer(state, action.playerId, {
    powerMeter: player.powerMeter - cost,
  });
  const events: Event[] = [
    {
      type: "power_activated",
      playerId: action.playerId,
      commanderId: player.commanderId,
      powerId: commander.power.id,
    },
  ];
  return { nextState, events };
}
