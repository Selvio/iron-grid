"use client";

import type { GameData } from "game-data";
import { useReducer } from "react";

import type { MatchView } from "@/app/lib/api-client";
import {
  INITIAL_INTERACTION,
  interactionReducer,
} from "@/app/lib/battlefield/machine";
import { previewUnitActions } from "@/app/lib/preview/actions";
import { previewMovementRange } from "@/app/lib/preview/movement";

import { ActionPanel } from "./action-panel";
import { Battlefield } from "./battlefield";
import { Hud, type HudUnit } from "./hud/hud";
import { InteractionOverlay, TILE_DISPLAY_PX } from "./interaction-overlay";

/**
 * Battlefield interaction controller (M10-T5).
 *
 * Owns the selection state and wires the pieces: the Phaser board beneath, the
 * DOM interaction overlay over it, and the HUD. Selecting one of your own,
 * not-yet-acted units on your turn computes its movement range in-browser (the
 * pure engine over the projected view) and highlights it. Destination/move,
 * action menu and combat preview land in T6.
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T5)
 */
export function BattlefieldView({
  matchView,
  gameData,
}: {
  matchView: MatchView;
  gameData: GameData;
}) {
  const [state, dispatch] = useReducer(interactionReducer, INITIAL_INTERACTION);
  const isMyTurn = matchView.activePlayerId === matchView.viewerPlayerId;

  function ownSelectableAt(x: number, y: number) {
    const unit = matchView.units.find(
      (u) => u.position !== null && u.position.x === x && u.position.y === y,
    );
    return unit !== undefined &&
      unit.ownerPlayerId === matchView.viewerPlayerId &&
      isMyTurn &&
      !unit.hasActed
      ? unit
      : undefined;
  }

  function select(unitId: string): void {
    dispatch({
      type: "select",
      unitId,
      reachable: previewMovementRange(matchView, unitId, gameData),
    });
  }

  function handleTileClick(x: number, y: number): void {
    const own = ownSelectableAt(x, y);
    if (state.kind === "unit-selected") {
      if (own !== undefined) return select(own.id);
      const reachable = state.reachable.some((c) => c.x === x && c.y === y);
      if (reachable) {
        dispatch({
          type: "choose-destination",
          destination: { x, y },
          actions: previewUnitActions(matchView, state.unitId, gameData),
        });
        return;
      }
      dispatch({ type: "deselect" });
      return;
    }
    if (own !== undefined) return select(own.id);
    dispatch({ type: "deselect" });
  }

  const selectedUnit =
    state.kind !== "idle"
      ? (matchView.units.find((u) => u.id === state.unitId) ?? null)
      : null;
  const hudUnit: HudUnit | null = selectedUnit
    ? {
        typeId: selectedUnit.typeId,
        ownerPlayerId: selectedUnit.ownerPlayerId,
        trueHp: selectedUnit.trueHp,
        fuel: selectedUnit.fuel,
        ammo: selectedUnit.ammo,
      }
    : null;
  const reachable = state.kind === "idle" ? [] : state.reachable;

  return (
    <div className="relative h-full w-full overflow-auto">
      <div
        className="relative"
        style={{
          width: matchView.map.width * TILE_DISPLAY_PX,
          height: matchView.map.height * TILE_DISPLAY_PX,
        }}
      >
        <div className="absolute inset-0">
          <Battlefield matchView={matchView} />
        </div>
        <div className="absolute inset-0">
          <InteractionOverlay
            width={matchView.map.width}
            height={matchView.map.height}
            reachable={reachable}
            onTileClick={handleTileClick}
          />
        </div>
      </div>
      <Hud matchView={matchView} selectedUnit={hudUnit} />
      <ActionPanel
        state={state}
        onConfirm={() => dispatch({ type: "deselect" })}
        onCancel={() => dispatch({ type: "cancel" })}
      />
    </div>
  );
}
