import type { Coordinate } from "game-engine";

/**
 * Battlefield interaction state machine (M10-T5).
 *
 * A framework-free reducer for the selection loop (`frontend.md` §5;
 * `game-specification.md` §27.2). T5 covers idle ↔ unit-selected (with the
 * movement-range preview); T6+ extend it with destination / action-menu /
 * combat-preview / confirm states. Kept pure so the whole loop is unit-tested
 * without a canvas.
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T5)
 */

export type InteractionState =
  | { readonly kind: "idle" }
  | {
      readonly kind: "unit-selected";
      readonly unitId: string;
      readonly reachable: readonly Coordinate[];
    };

export type InteractionEvent =
  | {
      readonly type: "select";
      readonly unitId: string;
      readonly reachable: readonly Coordinate[];
    }
  | { readonly type: "deselect" };

export const INITIAL_INTERACTION: InteractionState = { kind: "idle" };

export function interactionReducer(
  _state: InteractionState,
  event: InteractionEvent,
): InteractionState {
  switch (event.type) {
    case "select":
      return {
        kind: "unit-selected",
        unitId: event.unitId,
        reachable: event.reachable,
      };
    case "deselect":
      return INITIAL_INTERACTION;
  }
}
