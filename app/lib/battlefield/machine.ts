import type { ActionType, CombatPreview, Coordinate } from "game-engine";

/**
 * Battlefield interaction state machine (M10-T5/T6).
 *
 * A framework-free reducer for the selection loop (`frontend.md` §5;
 * `game-specification.md` §27.2): idle → unit-selected (movement range) →
 * destination (action menu) → combat-preview (min/max forecast) → confirm+submit
 * (T7). `reachable` is carried forward so `cancel` can step back one state
 * without recomputing. Pure, so the whole loop is unit-tested without a canvas.
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T6)
 */

export type InteractionState =
  | { readonly kind: "idle" }
  | {
      readonly kind: "unit-selected";
      readonly unitId: string;
      readonly reachable: readonly Coordinate[];
    }
  | {
      readonly kind: "destination";
      readonly unitId: string;
      readonly reachable: readonly Coordinate[];
      readonly destination: Coordinate;
      readonly actions: readonly ActionType[];
    }
  | {
      readonly kind: "combat-preview";
      readonly unitId: string;
      readonly reachable: readonly Coordinate[];
      readonly destination: Coordinate;
      readonly actions: readonly ActionType[];
      readonly targetUnitId: string;
      readonly preview: CombatPreview;
    };

export type InteractionEvent =
  | {
      readonly type: "select";
      readonly unitId: string;
      readonly reachable: readonly Coordinate[];
    }
  | {
      readonly type: "choose-destination";
      readonly destination: Coordinate;
      readonly actions: readonly ActionType[];
    }
  | {
      readonly type: "choose-target";
      readonly targetUnitId: string;
      readonly preview: CombatPreview;
    }
  | { readonly type: "cancel" }
  | { readonly type: "deselect" };

export const INITIAL_INTERACTION: InteractionState = { kind: "idle" };

export function interactionReducer(
  state: InteractionState,
  event: InteractionEvent,
): InteractionState {
  switch (event.type) {
    case "select":
      return {
        kind: "unit-selected",
        unitId: event.unitId,
        reachable: event.reachable,
      };

    case "choose-destination":
      if (state.kind !== "unit-selected") return state;
      return {
        kind: "destination",
        unitId: state.unitId,
        reachable: state.reachable,
        destination: event.destination,
        actions: event.actions,
      };

    case "choose-target":
      if (state.kind !== "destination") return state;
      return {
        kind: "combat-preview",
        unitId: state.unitId,
        reachable: state.reachable,
        destination: state.destination,
        actions: state.actions,
        targetUnitId: event.targetUnitId,
        preview: event.preview,
      };

    case "cancel":
      if (state.kind === "combat-preview") {
        return {
          kind: "destination",
          unitId: state.unitId,
          reachable: state.reachable,
          destination: state.destination,
          actions: state.actions,
        };
      }
      if (state.kind === "destination") {
        return {
          kind: "unit-selected",
          unitId: state.unitId,
          reachable: state.reachable,
        };
      }
      return state;

    case "deselect":
      return INITIAL_INTERACTION;
  }
}
