/**
 * The action envelope players submit (`rules.yaml` → state_model.action, §11).
 *
 * `Action` is a discriminated union on `type`. The two actions M2 resolves —
 * `move_and_wait` and `end_turn` — are fully typed; the remaining action types
 * are declared with an opaque payload and given real variants as their systems
 * land in M3. The client never decides legality; the engine computes it (§11).
 *
 * @see docs/02-data/rules.yaml → enums.action_types, state_model.action
 * @see docs/04-development/milestones/m2-engine-core.md (M2-T1)
 */

import type { ActionType } from "./enums";
import type { Coordinate, Id } from "./state";

/** Fields common to every submitted action (`state_model.action`). */
export interface ActionEnvelope {
  readonly matchId: Id;
  readonly playerId: Id;
  /** Optimistic-concurrency guard checked by the backend, not the engine (§25). */
  readonly expectedStateVersion: number;
  readonly idempotencyKey: string;
}

/** Move a unit along an ordered path and end its activation (§10). */
export interface MoveAndWaitAction extends ActionEnvelope {
  readonly type: "move_and_wait";
  readonly unitId: Id;
  /** Ordered path including the start tile (§10.2). */
  readonly path: readonly Coordinate[];
}

/** Hand the turn to the next player (§ turn_sequence.end_turn). */
export interface EndTurnAction extends ActionEnvelope {
  readonly type: "end_turn";
}

/**
 * Placeholder for the action types resolved in M3 (attack, capture, produce, …).
 * Refined into precise variants as each system lands; kept in the union now so
 * exhaustive handling is enforced from the start.
 */
export interface FutureAction extends ActionEnvelope {
  readonly type: Exclude<ActionType, "move_and_wait" | "end_turn">;
  readonly payload?: unknown;
}

/** Any action a player may submit. */
export type Action = MoveAndWaitAction | EndTurnAction | FutureAction;
