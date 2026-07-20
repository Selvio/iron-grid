/**
 * Victory and defeat evaluation (§23; `rules.yaml` → victory data).
 *
 * The engine owns two standard conditions: an enemy **HQ captured** (§13.5,
 * §23.1) and an enemy **army eliminated** (§23.2). Resignation and Claim-Victory
 * are backend triggers (M7/M8) and day-limit scoring is gated (§23.4/§33.2) — so
 * `evaluateVictory` computes no score, only the decisive HQ/elimination outcome.
 *
 * Evaluation runs on the **resolved end-of-action / start-of-turn state**, so a
 * transient zero-unit state mid-resolution never counts (§23.2 timing). Only
 * genuine participants (players with any unit or property) are judged, and the
 * match completes solely when exactly one participant survives among two or more
 * — never as an automatic draw on mutual loss (§23.5). Draws no randomness.
 *
 * **Elimination requires losing the ability to field an army, not merely having
 * no unit on the board** — a player who still owns a base, airport or port is
 * between armies (ADR-0007, resolving `rules.yaml` → `army-elimination-edge-case`).
 *
 * @see docs/decisions/0007-army-elimination-with-production.md
 * @see docs/01-specification/game-specification.md §23, §13.5
 * @see docs/04-development/milestones/m3-combat-systems-fog.md (M3-T7)
 */

import type { GameData } from "game-data";

import { updateMatch } from "./board";
import type { VictoryResult } from "./engine";
import type { Event } from "./events";
import type { Id, MatchState, PlayerState } from "./state";

/** Whether a property type's capture defeats its owner — i.e. it is an HQ (§13.2). */
function isHeadquarters(gameData: GameData, typeId: string): boolean {
  return (
    gameData.properties[typeId]?.defeat?.triggers_defeat_on_capture === true
  );
}

/**
 * Whether a property type can build units — a base, airport or port
 * (`properties.yaml` → `production.category`; `"none"` for everything else,
 * including the headquarters).
 */
function isProducer(gameData: GameData, typeId: string): boolean {
  // Optional throughout: a fixture may describe a property without a production
  // block at all, and "no production data" simply means "cannot build".
  const category = gameData.properties[typeId]?.production?.category;
  return category !== undefined && category !== "none";
}

/**
 * Evaluate the decisive victory conditions on the resolved state. Returns
 * `{ completed: false }` unless exactly one of two-or-more participants survives.
 */
export function evaluateVictory(
  state: MatchState,
  gameData: GameData,
): VictoryResult {
  if (state.match.status !== "active") return { completed: false };

  const hasUnits = (id: Id): boolean =>
    state.units.some((u) => u.ownerPlayerId === id);
  const ownsProperty = (id: Id): boolean =>
    state.properties.some((p) => p.ownerPlayerId === id);
  const ownsHeadquarters = (id: Id): boolean =>
    state.properties.some(
      (p) => p.ownerPlayerId === id && isHeadquarters(gameData, p.typeId),
    );
  const canProduce = (id: Id): boolean =>
    state.properties.some(
      (p) => p.ownerPlayerId === id && isProducer(gameData, p.typeId),
    );

  // Only players still holding a unit or property are in the game — this keeps
  // degenerate/partial states from registering a spurious result.
  const participants = state.players.filter(
    (p) => hasUnits(p.playerId) || ownsProperty(p.playerId),
  );
  if (participants.length < 2) return { completed: false };

  const hqsExist = state.properties.some((p) =>
    isHeadquarters(gameData, p.typeId),
  );
  // An army is only *eliminated* when it cannot come back: no units on the board
  // **and** nothing left to build them with (ADR-0007). A player who still holds
  // a base is between armies, not out of the match — without this, a map that
  // starts both sides at zero units (`starting_units: []`) hands the win to
  // whoever produces first, and losing your last unit beside your own base ends
  // the match outright.
  const defeated = (p: PlayerState): boolean =>
    (!hasUnits(p.playerId) && !canProduce(p.playerId)) ||
    (hqsExist && !ownsHeadquarters(p.playerId));

  const survivors = participants.filter((p) => !defeated(p));
  if (survivors.length !== 1) return { completed: false }; // no unique winner (§23.5)

  const winner = survivors[0]!;
  const loser = participants.find((p) => defeated(p))!;
  const reason =
    hqsExist && !ownsHeadquarters(loser.playerId)
      ? "headquarters_captured"
      : "army_eliminated";
  return { completed: true, winnerPlayerId: winner.playerId, reason };
}

/**
 * Evaluate victory and, if decisive, mark the match completed and emit
 * `match_completed`. Idempotent: a no-op once the match is no longer active.
 * The completion timestamp is stamped by the backend, not the engine.
 */
export function finalizeVictory(
  state: MatchState,
  gameData: GameData,
): { readonly state: MatchState; readonly events: Event[] } {
  const result = evaluateVictory(state, gameData);
  if (!result.completed) return { state, events: [] };

  const next = updateMatch(state, {
    status: "completed",
    winnerPlayerId: result.winnerPlayerId ?? null,
    completionReason: result.reason ?? null,
  });
  const events: Event[] = [
    {
      type: "match_completed",
      winnerPlayerId: result.winnerPlayerId ?? null,
      reason: result.reason ?? null,
    },
  ];
  return { state: next, events };
}
