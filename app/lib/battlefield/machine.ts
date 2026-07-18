import type { CombatPreview, Coordinate } from "game-engine";

import type { DestinationOptions, UnitMenu } from "@/app/lib/preview/actions";

/**
 * Battlefield interaction state machine (M10-T5/T6, extended for the selectable
 * action menu).
 *
 * A framework-free reducer for the Advance-Wars selection loop (`frontend.md` §5;
 * `game-specification.md` §27.2): idle → unit-selected (movement range) →
 * action-menu (Wait / Capture / Attack at the chosen tile) → select-target
 * (choose an enemy) → combat-preview (min/max forecast) → confirm+submit. The
 * unit's `menu` and per-tile `options` are carried forward so `cancel` steps back
 * one state without recomputing. Pure, so the whole loop is unit-tested without a
 * canvas.
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T6)
 */

export type InteractionState =
  | { readonly kind: "idle" }
  | {
      readonly kind: "unit-selected";
      readonly unitId: string;
      readonly menu: UnitMenu;
    }
  | {
      readonly kind: "action-menu";
      readonly unitId: string;
      readonly menu: UnitMenu;
      readonly destination: Coordinate;
      readonly options: DestinationOptions;
    }
  | {
      readonly kind: "select-target";
      readonly unitId: string;
      readonly menu: UnitMenu;
      readonly destination: Coordinate;
      readonly options: DestinationOptions;
      /** The enemy unit ids attackable from `destination` (highlight these). */
      readonly targets: readonly string[];
    }
  | {
      readonly kind: "combat-preview";
      readonly unitId: string;
      readonly menu: UnitMenu;
      readonly destination: Coordinate;
      readonly options: DestinationOptions;
      readonly targetUnitId: string;
      readonly preview: CombatPreview;
    };

export type InteractionEvent =
  | {
      readonly type: "select";
      readonly unitId: string;
      readonly menu: UnitMenu;
    }
  | {
      readonly type: "choose-destination";
      readonly destination: Coordinate;
      readonly options: DestinationOptions;
    }
  | { readonly type: "begin-attack" }
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
      return { kind: "unit-selected", unitId: event.unitId, menu: event.menu };

    case "choose-destination":
      if (state.kind !== "unit-selected") return state;
      return {
        kind: "action-menu",
        unitId: state.unitId,
        menu: state.menu,
        destination: event.destination,
        options: event.options,
      };

    case "begin-attack":
      if (state.kind !== "action-menu") return state;
      if (state.options.attackTargets.length === 0) return state;
      return {
        kind: "select-target",
        unitId: state.unitId,
        menu: state.menu,
        destination: state.destination,
        options: state.options,
        targets: state.options.attackTargets,
      };

    case "choose-target":
      // Reachable both directly from the menu (single target) and from the
      // explicit target picker (multiple targets).
      if (state.kind !== "action-menu" && state.kind !== "select-target") {
        return state;
      }
      return {
        kind: "combat-preview",
        unitId: state.unitId,
        menu: state.menu,
        destination: state.destination,
        options: state.options,
        targetUnitId: event.targetUnitId,
        preview: event.preview,
      };

    case "cancel":
      // combat-preview and select-target both step back to the action menu; the
      // action menu steps back to the selected unit; a selected unit clears.
      if (state.kind === "combat-preview" || state.kind === "select-target") {
        return {
          kind: "action-menu",
          unitId: state.unitId,
          menu: state.menu,
          destination: state.destination,
          options: state.options,
        };
      }
      if (state.kind === "action-menu") {
        return {
          kind: "unit-selected",
          unitId: state.unitId,
          menu: state.menu,
        };
      }
      if (state.kind === "unit-selected") return INITIAL_INTERACTION;
      return state;

    case "deselect":
      return INITIAL_INTERACTION;
  }
}
