"use client";

import type { GameData } from "game-data";
import type { Coordinate } from "game-engine";
import { useReducer, useRef, useState } from "react";

import {
  ApiError,
  apiClient,
  type ActionBody,
  type MatchView,
} from "@/app/lib/api-client";
import {
  INITIAL_INTERACTION,
  interactionReducer,
} from "@/app/lib/battlefield/machine";
import {
  actionsAtDestination,
  previewCombat,
  previewUnitMenu,
} from "@/app/lib/preview/actions";
import { computePath } from "@/app/lib/preview/path";
import {
  prefersReducedMotion,
  submittedAttackPlan,
  submittedMovePlan,
  type AnimationStep,
} from "@/app/lib/render/animation-plan";

import { Button } from "@/app/components/ui/button";

import { ActionPanel } from "./action-panel";
import { Battlefield } from "./battlefield";
import type { BattlefieldHandle } from "./create-game";
import { Hud, type HudUnit } from "./hud/hud";
import { InteractionOverlay, TILE_DISPLAY_PX } from "./interaction-overlay";

/**
 * Battlefield interaction controller (M10-T5/T6/T7).
 *
 * Owns the projected view + selection state and wires the pieces: the Phaser
 * board, the DOM interaction overlay, the HUD and the Advance-Wars action menu.
 * Selecting an own unit previews its range; choosing a destination opens the
 * no-undo menu (Wait / Capture / Attack) computed **in-browser by the pure
 * engine**; Attack opens a target picker then a min/max forecast. Committing an
 * action **submits** it (`expectedStateVersion` + a fresh `idempotencyKey`),
 * plays the resolved-event animation, then refetches the authoritative view. A
 * stale submit is a typed 409 conflict that also refetches — the client never
 * re-applies locally (`frontend.md` §9).
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T6, M10-T7)
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
  const sceneRef = useRef<BattlefieldHandle | null>(null);
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
      menu: previewUnitMenu(view, unitId, gameData),
    });
  }

  function handleTileClick(x: number, y: number): void {
    if (busy) return;
    const own = ownSelectableAt(x, y);

    if (state.kind === "unit-selected") {
      // Clicking a *different* own unit re-selects it; clicking the selected
      // unit's own tile falls through and opens its in-place action menu.
      if (own !== undefined && own.id !== state.unitId) return select(own.id);
      const destination = { x, y };
      const options = actionsAtDestination(state.menu, destination);
      if (
        options.canWait ||
        options.canCapture ||
        options.attackTargets.length > 0
      ) {
        dispatch({ type: "choose-destination", destination, options });
        return;
      }
      dispatch({ type: "deselect" });
      return;
    }

    if (state.kind === "select-target") {
      const target = view.units.find(
        (u) =>
          u.position !== null &&
          u.position.x === x &&
          u.position.y === y &&
          state.targets.includes(u.id),
      );
      if (target !== undefined) {
        dispatch({
          type: "choose-target",
          targetUnitId: target.id,
          preview: previewCombat(view, state.unitId, target.id, gameData),
        });
      }
      return; // a non-target click is ignored; use Cancel to step back
    }

    // idle (and the menu/preview states, which are driven by the panel buttons).
    if (own !== undefined) return select(own.id);
    if (state.kind === "idle") dispatch({ type: "deselect" });
  }

  /** Refetch the authoritative projected view (reconcile, never re-apply). */
  async function refetch(): Promise<void> {
    const fresh = await apiClient.getMatch(view.matchId);
    if ("map" in fresh) setView(fresh);
    dispatch({ type: "deselect" });
  }

  /** Submit an action, play its animation, then reconcile by refetch. */
  async function runSubmit(
    body: ActionBody,
    plan: AnimationStep[],
  ): Promise<void> {
    setBusy(true);
    try {
      await apiClient.submitAction(view.matchId, body);
      // Animate the committed action before reconciling; input stays blocked via
      // `busy`. Animation never gates the authoritative state — the refetch below
      // reconciles regardless (§28.2).
      await sceneRef.current?.playAnimation(plan);
      await refetch();
    } catch (error) {
      // A stale-version conflict (or any error) reconciles by refetching.
      if (error instanceof ApiError) await refetch();
    } finally {
      setBusy(false);
    }
  }

  const envelope = () => ({
    expectedStateVersion: view.stateVersion,
    idempotencyKey: crypto.randomUUID(),
  });

  /** The path from the selected unit to `destination`, or null when unreachable. */
  function pathTo(
    unitId: string,
    destination: Coordinate,
  ): Coordinate[] | null {
    return computePath(view, unitId, destination, gameData);
  }

  function submitWait(): void {
    if (state.kind !== "action-menu") return;
    const path = pathTo(state.unitId, state.destination);
    if (path === null) return void dispatch({ type: "deselect" });
    const reducedMotion = prefersReducedMotion();
    void runSubmit(
      { type: "move_and_wait", unitId: state.unitId, path, ...envelope() },
      submittedMovePlan(state.unitId, path, { reducedMotion }),
    );
  }

  function submitCapture(): void {
    if (state.kind !== "action-menu") return;
    const path = pathTo(state.unitId, state.destination);
    if (path === null) return void dispatch({ type: "deselect" });
    const reducedMotion = prefersReducedMotion();
    void runSubmit(
      { type: "capture", unitId: state.unitId, path, ...envelope() },
      submittedMovePlan(state.unitId, path, { reducedMotion }),
    );
  }

  function beginAttack(): void {
    if (state.kind !== "action-menu") return;
    const targets = state.options.attackTargets;
    // One target: skip the picker and go straight to the forecast.
    if (targets.length === 1) {
      const targetUnitId = targets[0]!;
      dispatch({
        type: "choose-target",
        targetUnitId,
        preview: previewCombat(view, state.unitId, targetUnitId, gameData),
      });
      return;
    }
    dispatch({ type: "begin-attack" });
  }

  function submitAttack(): void {
    if (state.kind !== "combat-preview") return;
    const path = pathTo(state.unitId, state.destination);
    if (path === null) return void dispatch({ type: "deselect" });
    const reducedMotion = prefersReducedMotion();
    void runSubmit(
      {
        type: "attack",
        unitId: state.unitId,
        targetUnitId: state.targetUnitId,
        path,
        ...envelope(),
      },
      submittedAttackPlan(state.unitId, path, state.targetUnitId, {
        reducedMotion,
      }),
    );
  }

  async function endTurn(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      await apiClient.submitAction(view.matchId, {
        type: "end_turn",
        ...envelope(),
      });
      await refetch();
    } catch (error) {
      if (error instanceof ApiError) await refetch();
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
  const reachable = state.kind === "idle" ? [] : state.menu.moveDestinations;
  const targetTiles =
    state.kind === "select-target"
      ? view.units
          .filter((u) => u.position !== null && state.targets.includes(u.id))
          .map((u) => u.position!)
      : [];

  return (
    <div className="relative flex h-full w-full overflow-auto">
      <div
        className="relative m-auto shrink-0"
        style={{
          width: view.map.width * TILE_DISPLAY_PX,
          height: view.map.height * TILE_DISPLAY_PX,
        }}
      >
        <div className="absolute inset-0">
          <Battlefield
            matchView={view}
            onSceneReady={(handle) => {
              sceneRef.current = handle;
            }}
          />
        </div>
        <div className="absolute inset-0">
          <InteractionOverlay
            width={view.map.width}
            height={view.map.height}
            reachable={reachable}
            targets={targetTiles}
            onTileClick={handleTileClick}
          />
        </div>
      </div>
      <Hud matchView={view} selectedUnit={hudUnit} />
      <ActionPanel
        state={state}
        handlers={{
          onWait: submitWait,
          onCapture: submitCapture,
          onAttack: beginAttack,
          onConfirmAttack: submitAttack,
          onCancel: () => dispatch({ type: "cancel" }),
        }}
      />
      {isMyTurn && state.kind === "idle" && (
        <Button
          className="pointer-events-auto absolute bottom-4 left-4"
          disabled={busy}
          onClick={() => void endTurn()}
        >
          End turn
        </Button>
      )}
    </div>
  );
}
