"use client";

import type { GameData } from "game-data";
import { useReducer, useState } from "react";

import { ApiError, apiClient, type MatchView } from "@/app/lib/api-client";
import {
  INITIAL_INTERACTION,
  interactionReducer,
} from "@/app/lib/battlefield/machine";
import { previewUnitActions } from "@/app/lib/preview/actions";
import { previewMovementRange } from "@/app/lib/preview/movement";
import { computePath } from "@/app/lib/preview/path";

import { ActionPanel } from "./action-panel";
import { Battlefield } from "./battlefield";
import { Hud, type HudUnit } from "./hud/hud";
import { InteractionOverlay, TILE_DISPLAY_PX } from "./interaction-overlay";

/**
 * Battlefield interaction controller (M10-T5/T6/T7).
 *
 * Owns the projected view + selection state and wires the pieces: the Phaser
 * board, the DOM interaction overlay, the HUD and the confirm panel. Selecting an
 * own unit previews its range; a destination opens the no-undo confirm; Confirm
 * **submits** the action (`expectedStateVersion` + a fresh `idempotencyKey`) and
 * then refetches the authoritative view. A stale submit is a typed 409 conflict
 * that also refetches — the client never re-applies locally (`frontend.md` §9).
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T7)
 */
export function BattlefieldView({
  matchView,
  gameData,
}: {
  matchView: MatchView;
  gameData: GameData;
}) {
  const [view, setView] = useState(matchView);
  const [state, dispatch] = useReducer(interactionReducer, INITIAL_INTERACTION);
  const [busy, setBusy] = useState(false);
  const isMyTurn = view.activePlayerId === view.viewerPlayerId;

  function ownSelectableAt(x: number, y: number) {
    const unit = view.units.find(
      (u) => u.position !== null && u.position.x === x && u.position.y === y,
    );
    return unit !== undefined &&
      unit.ownerPlayerId === view.viewerPlayerId &&
      isMyTurn &&
      !unit.hasActed
      ? unit
      : undefined;
  }

  function select(unitId: string): void {
    dispatch({
      type: "select",
      unitId,
      reachable: previewMovementRange(view, unitId, gameData),
    });
  }

  function handleTileClick(x: number, y: number): void {
    if (busy) return;
    const own = ownSelectableAt(x, y);
    if (state.kind === "unit-selected") {
      if (own !== undefined) return select(own.id);
      if (state.reachable.some((c) => c.x === x && c.y === y)) {
        dispatch({
          type: "choose-destination",
          destination: { x, y },
          actions: previewUnitActions(view, state.unitId, gameData),
        });
        return;
      }
      dispatch({ type: "deselect" });
      return;
    }
    if (own !== undefined) return select(own.id);
    dispatch({ type: "deselect" });
  }

  /** Refetch the authoritative projected view (reconcile, never re-apply). */
  async function refetch(): Promise<void> {
    const fresh = await apiClient.getMatch(view.matchId);
    if ("map" in fresh) setView(fresh);
    dispatch({ type: "deselect" });
  }

  async function handleConfirm(): Promise<void> {
    if (state.kind !== "destination" || busy) return;
    const path = computePath(view, state.unitId, state.destination, gameData);
    if (path === null) {
      dispatch({ type: "deselect" });
      return;
    }
    setBusy(true);
    try {
      await apiClient.submitAction(view.matchId, {
        type: "move_and_wait",
        unitId: state.unitId,
        path,
        expectedStateVersion: view.stateVersion,
        idempotencyKey: crypto.randomUUID(),
      });
      await refetch();
    } catch (error) {
      // A stale-version conflict (or any error) reconciles by refetching.
      if (error instanceof ApiError) {
        await refetch();
      }
    } finally {
      setBusy(false);
    }
  }

  const selectedUnit =
    state.kind !== "idle"
      ? (view.units.find((u) => u.id === state.unitId) ?? null)
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
          width: view.map.width * TILE_DISPLAY_PX,
          height: view.map.height * TILE_DISPLAY_PX,
        }}
      >
        <div className="absolute inset-0">
          <Battlefield matchView={view} />
        </div>
        <div className="absolute inset-0">
          <InteractionOverlay
            width={view.map.width}
            height={view.map.height}
            reachable={reachable}
            onTileClick={handleTileClick}
          />
        </div>
      </div>
      <Hud matchView={view} selectedUnit={hudUnit} />
      <ActionPanel
        state={state}
        onConfirm={() => void handleConfirm()}
        onCancel={() => dispatch({ type: "cancel" })}
      />
    </div>
  );
}
