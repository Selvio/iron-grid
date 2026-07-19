"use client";

import type { GameData } from "game-data";
import type { Coordinate } from "game-engine";
import { Crosshair, Flag, Minus, Plus } from "lucide-react";
import { useEffect, useReducer, useRef, useState } from "react";

import {
  ApiError,
  apiClient,
  type ActionBody,
  type MatchView,
} from "@/app/lib/api-client";
import {
  INITIAL_INTERACTION,
  interactionReducer,
  type CombatDefender,
} from "@/app/lib/battlefield/machine";
import {
  actionsAtDestination,
  attackRangeTiles,
  previewCombat,
  previewProduction,
  previewUnitMenu,
  productionTargetAt,
  unloadCargo,
  unloadDropTiles,
  unitSprite,
  type DestinationOptions,
} from "@/app/lib/preview/actions";
import { computePath } from "@/app/lib/preview/path";
import { cn } from "@/app/lib/utils";
import { formatCountdown } from "@/app/lib/format";
import { TERRAIN_TILE_PX } from "@/app/lib/render/derive-render-data";
import {
  prefersReducedMotion,
  submittedAttackPlan,
  submittedMovePlan,
  type AnimationStep,
} from "@/app/lib/render/animation-plan";

import { ActionPanel } from "./action-panel";
import { Battlefield } from "./battlefield";
import type { BattlefieldHandle } from "./create-game";
import { Hud, type HudTerrain, type HudUnit } from "./hud/hud";
import { InteractionOverlay, TILE_DISPLAY_PX } from "./interaction-overlay";

/** Board zoom bounds — 10% steps, tile size snapped to whole CSS pixels. */
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;
const clampZoom = (z: number): number =>
  Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 10) / 10));
/** Display tile size for a UI zoom (always an integer CSS px). */
const tilePxForZoom = (z: number): number =>
  Math.round(TILE_DISPLAY_PX * clampZoom(z));

/** Whether a chosen tile offers any legal action for the selected unit. */
function anyAction(o: DestinationOptions): boolean {
  return (
    o.canWait ||
    o.canCapture ||
    o.attackTargets.length > 0 ||
    o.canSupply ||
    o.canJoin ||
    o.canLoad ||
    o.canUnload ||
    o.canDive ||
    o.canSurface
  );
}

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
  const [hovered, setHovered] = useState<Coordinate | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [confirmEnd, setConfirmEnd] = useState(false);
  // The attack-range hatch is off until the player asks for it with Space; it
  // resets with every selection so the board starts clean.
  const [showRange, setShowRange] = useState(false);
  const sceneRef = useRef<BattlefieldHandle | null>(null);
  const turnKeyRef = useRef(
    `${matchView.currentDay}:${matchView.activePlayerId}`,
  );
  const isMyTurn = view.activePlayerId === view.viewerPlayerId;
  const tilePx = tilePxForZoom(zoom);
  const artScale = tilePx / TERRAIN_TILE_PX;

  // A transient Advance-Wars turn banner whenever the day or active player flips.
  useEffect(() => {
    const key = `${view.currentDay}:${view.activePlayerId}`;
    if (key === turnKeyRef.current) return;
    turnKeyRef.current = key;
    setBanner(
      `Day ${view.currentDay} · ${isMyTurn ? "Your turn" : "Opponent's turn"}`,
    );
    const timer = setTimeout(() => setBanner(null), 2200);
    return () => clearTimeout(timer);
  }, [view.currentDay, view.activePlayerId, isMyTurn]);

  // Escape closes the end-turn confirmation dialog.
  useEffect(() => {
    if (!confirmEnd) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmEnd(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmEnd]);

  // Space toggles the attack-range hatch for the selected unit, the way Advance
  // Wars shows a range on demand.
  const selectedUnitId = state.kind === "unit-selected" ? state.unitId : null;
  useEffect(() => {
    if (selectedUnitId === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " ") return;
      e.preventDefault(); // Space would otherwise scroll the board
      setShowRange((previous) => !previous);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedUnitId]);

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
    const menu = previewUnitMenu(view, unitId, gameData);
    setShowRange(false); // a fresh selection starts with the board clean
    dispatch({
      type: "select",
      unitId,
      menu,
    });
  }

  /** The defender's HP + terrain-defense stats for the combat forecast panel. */
  function combatDefender(targetUnitId: string): CombatDefender | undefined {
    const target = view.units.find((u) => u.id === targetUnitId);
    if (target === undefined || target.position === null) return undefined;
    const def = gameData.units[target.typeId];
    const terrainId =
      view.map.logicalTerrain[target.position.y]?.[target.position.x];
    const stars =
      def?.category === "air"
        ? 0
        : ((terrainId ? gameData.terrain[terrainId]?.defense_stars : 0) ?? 0);
    return {
      displayName: def?.display_name ?? target.typeId,
      trueHp: target.trueHp,
      stars,
    };
  }

  function handleTileClick(x: number, y: number): void {
    if (busy) return;
    const own = ownSelectableAt(x, y);

    if (state.kind === "unit-selected") {
      const destination = { x, y };
      const options = actionsAtDestination(state.menu, destination);
      // A legal action at this tile (incl. join/load onto a friendly) wins over
      // re-selecting; only a click with no legal action re-selects or clears.
      if (anyAction(options)) {
        dispatch({ type: "choose-destination", destination, options });
        return;
      }
      if (own !== undefined && own.id !== state.unitId) return select(own.id);
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
          defender: combatDefender(target.id),
        });
      }
      return; // a non-target click is ignored; use Cancel to step back
    }

    if (state.kind === "unload-drop") {
      if (state.dropTiles.some((t) => t.x === x && t.y === y)) {
        submitUnload(x, y);
      }
      return; // a non-drop click is ignored; use Cancel to step back
    }

    // Post-move menu: re-clicking the chosen tile confirms the move. Another
    // legal tile re-picks; anything else cancels back to the range preview.
    if (state.kind === "action-menu") {
      const onDestination =
        state.destination.x === x && state.destination.y === y;
      if (onDestination && state.options.canWait) {
        submitWait();
        return;
      }
      const destination = { x, y };
      const options = actionsAtDestination(state.menu, destination);
      if (anyAction(options)) {
        dispatch({ type: "choose-destination", destination, options });
        return;
      }
      if (own !== undefined) return select(own.id);
      dispatch({ type: "cancel" });
      return;
    }

    // idle (and combat-preview / unload-cargo, which are panel-driven).
    if (own !== undefined) return select(own.id);
    if (state.kind === "idle") {
      // An owned, empty production property opens the build menu (§6.4).
      const property = isMyTurn
        ? productionTargetAt(view, gameData, x, y)
        : null;
      if (property !== null) {
        dispatch({
          type: "open-production",
          property: { id: property.id, position: property.position },
          options: previewProduction(view, gameData, property),
        });
        return;
      }
      dispatch({ type: "deselect" });
    }
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
        defender: combatDefender(targetUnitId),
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
    const plan = submittedAttackPlan(state.unitId, path, state.targetUnitId, {
      reducedMotion,
    });
    // Animate the defender's death only when it is a *guaranteed* kill — the min
    // (luck-0) forecast already meets its HP — so the speculative destroy can
    // never contradict the authoritative result the refetch brings back.
    if (
      !reducedMotion &&
      state.defender !== undefined &&
      state.preview.minDamage >= state.defender.trueHp
    ) {
      plan.push({ kind: "destroy", unitId: state.targetUnitId });
    }
    void runSubmit(
      {
        type: "attack",
        unitId: state.unitId,
        targetUnitId: state.targetUnitId,
        path,
        ...envelope(),
      },
      plan,
    );
  }

  function submitProduce(unitTypeId: string): void {
    if (state.kind !== "production-menu") return;
    // The server assigns the new unit's id — the client sends only the property
    // and the unit type (§6.4). No animation; the unit appears on refetch.
    void runSubmit(
      {
        type: "produce",
        propertyId: state.property.id,
        unitTypeId,
        ...envelope(),
      },
      [],
    );
  }

  /** Submit a move-then-act logistics action (supply/join/load) from the menu. */
  function submitMoveAction(type: "supply" | "join" | "load"): void {
    if (state.kind !== "action-menu") return;
    const path = pathTo(state.unitId, state.destination);
    if (path === null) return void dispatch({ type: "deselect" });
    void runSubmit(
      { type, unitId: state.unitId, path, ...envelope() },
      submittedMovePlan(state.unitId, path, {
        reducedMotion: prefersReducedMotion(),
      }),
    );
  }

  /** Submit an in-place dive/surface (no move component). */
  function submitStateChange(type: "dive" | "surface"): void {
    if (state.kind !== "action-menu") return;
    void runSubmit({ type, unitId: state.unitId, ...envelope() }, []);
  }

  /** Open the unload flow: skip the cargo picker when a single unit is aboard. */
  function beginUnload(): void {
    if (state.kind !== "action-menu") return;
    const cargo = unloadCargo(view, gameData, state.unitId);
    if (cargo.length === 0) return;
    if (cargo.length === 1) {
      const cargoUnitId = cargo[0]!.unitId;
      dispatch({
        type: "choose-cargo",
        cargoUnitId,
        dropTiles: unloadDropTiles(
          view,
          gameData,
          state.unitId,
          state.destination,
          cargoUnitId,
        ),
      });
      return;
    }
    dispatch({ type: "open-unload", cargo });
  }

  /** Pick which cargo to drop, from the multi-cargo picker. */
  function chooseCargo(cargoUnitId: string): void {
    if (state.kind !== "unload-cargo") return;
    dispatch({
      type: "choose-cargo",
      cargoUnitId,
      dropTiles: unloadDropTiles(
        view,
        gameData,
        state.unitId,
        state.destination,
        cargoUnitId,
      ),
    });
  }

  /** Submit the unload once a drop tile is clicked on the board. */
  function submitUnload(x: number, y: number): void {
    if (state.kind !== "unload-drop") return;
    const path = pathTo(state.unitId, state.destination);
    if (path === null) return void dispatch({ type: "deselect" });
    void runSubmit(
      {
        type: "unload",
        unitId: state.unitId,
        path,
        unloads: [{ cargoUnitId: state.cargoUnitId, to: { x, y } }],
        ...envelope(),
      },
      submittedMovePlan(state.unitId, path, {
        reducedMotion: prefersReducedMotion(),
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

  // The production menu is property-based — it carries no selected unit or range.
  const selectedUnit =
    "unitId" in state
      ? (view.units.find((u) => u.id === state.unitId) ?? null)
      : null;
  const selectedDef = selectedUnit
    ? gameData.units[selectedUnit.typeId]
    : undefined;
  const selectedTerrainId = selectedUnit?.position
    ? view.map.logicalTerrain[selectedUnit.position.y]?.[
        selectedUnit.position.x
      ]
    : undefined;
  const selectedTerrainDef = selectedTerrainId
    ? gameData.terrain[selectedTerrainId]
    : undefined;
  const hudUnit: HudUnit | null = selectedUnit
    ? {
        typeId: selectedUnit.typeId,
        ownerPlayerId: selectedUnit.ownerPlayerId,
        trueHp: selectedUnit.trueHp,
        maxHp: selectedDef?.max_true_hp ?? 100,
        fuel: selectedUnit.fuel,
        ammo: selectedUnit.ammo,
        movementType: selectedDef?.movement?.type ?? "",
        movePoints: selectedDef?.movement?.points ?? 0,
        sprite: unitSprite(view, gameData, selectedUnit.typeId),
        terrain: selectedTerrainDef
          ? {
              name: selectedTerrainDef.display_name,
              defenseStars: selectedTerrainDef.defense_stars,
            }
          : null,
      }
    : null;
  // The move range (blue) during selection; the drop tiles while placing cargo.
  const reachable =
    state.kind === "unload-drop"
      ? state.dropTiles
      : "menu" in state
        ? state.menu.moveDestinations
        : [];
  // The red firing hatch, only while the player is holding it open with Space:
  // hatching every selection would swamp the board, and an indirect unit's ring
  // is as much of an interruption as a direct unit's threat range.
  const attackRange =
    state.kind === "unit-selected" && showRange
      ? attackRangeTiles(view, gameData, state.unitId, state.menu)
      : [];
  const tileOf = (unitId: string): Coordinate | null =>
    view.units.find((u) => u.id === unitId)?.position ?? null;
  // Attackable enemies are highlighted red while picking; the chosen target keeps
  // the reticle through the damage forecast so the aim stays clear.
  const targetTiles =
    state.kind === "select-target"
      ? state.targets.map(tileOf).filter((t): t is Coordinate => t !== null)
      : [];
  const reticleTiles =
    state.kind === "select-target"
      ? targetTiles
      : state.kind === "combat-preview"
        ? [tileOf(state.targetUnitId)].filter(
            (t): t is Coordinate => t !== null,
          )
        : [];

  // Advance-Wars terrain read-out for the tile under the cursor.
  const terrainId = hovered && view.map.logicalTerrain[hovered.y]?.[hovered.x];
  const terrainDef = terrainId ? gameData.terrain[terrainId] : undefined;
  const hudTerrain: HudTerrain | null = terrainDef
    ? { name: terrainDef.display_name, defenseStars: terrainDef.defense_stars }
    : null;

  // The move-path arrow to the reachable tile under the cursor, while selecting.
  const hoverPath =
    state.kind === "unit-selected" &&
    hovered &&
    state.menu.moveDestinations.some(
      (c) => c.x === hovered.x && c.y === hovered.y,
    )
      ? (computePath(view, state.unitId, hovered, gameData) ?? [])
      : [];

  return (
    <div className="relative flex h-full w-full overflow-auto bg-gradient-to-b from-[#bfe3ff] to-[#93c8ef]">
      {/* Board sized directly to the art scale — no CSS transform (fractional
          scale() caused uneven pixels and Phaser RESIZE desync). */}
      <div
        className="m-auto shrink-0"
        style={{
          width: view.map.width * tilePx,
          height: view.map.height * tilePx,
        }}
      >
        <div
          className="relative box-content overflow-hidden rounded-[20px] border-4 border-[#1c2b45] shadow-[0_10px_0_rgba(28,43,69,0.32)]"
          style={{
            width: view.map.width * tilePx,
            height: view.map.height * tilePx,
            imageRendering: "pixelated",
          }}
        >
          <div className="absolute inset-0">
            <Battlefield
              matchView={view}
              artScale={artScale}
              onSceneReady={(handle) => {
                sceneRef.current = handle;
              }}
            />
          </div>
          <div className="absolute inset-0">
            <InteractionOverlay
              width={view.map.width}
              height={view.map.height}
              tilePx={tilePx}
              reachable={reachable}
              attackRange={attackRange}
              targets={targetTiles}
              reticles={reticleTiles}
              path={hoverPath}
              onTileClick={handleTileClick}
              onTileHover={(x, y) => setHovered({ x, y })}
            />
          </div>
        </div>
      </div>
      <Hud matchView={view} selectedUnit={hudUnit} terrain={hudTerrain} />
      <ActionPanel
        state={state}
        unitOrigin={selectedUnit?.position ?? null}
        funds={view.you?.funds ?? 0}
        handlers={{
          onWait: submitWait,
          onCapture: submitCapture,
          onAttack: beginAttack,
          onConfirmAttack: submitAttack,
          onProduce: submitProduce,
          onSupply: () => submitMoveAction("supply"),
          onJoin: () => submitMoveAction("join"),
          onLoad: () => submitMoveAction("load"),
          onDive: () => submitStateChange("dive"),
          onSurface: () => submitStateChange("surface"),
          onUnload: beginUnload,
          onChooseCargo: chooseCargo,
          onCancel: () => dispatch({ type: "cancel" }),
        }}
      />
      {isMyTurn && state.kind === "idle" && (
        <button
          type="button"
          className="pointer-events-auto absolute bottom-4 right-4 flex items-center gap-2 rounded-2xl border-4 border-[#1c2b45] bg-gradient-to-b from-[#ffd94a] to-[#f5b820] px-6 py-3.5 font-display text-lg font-extrabold text-[#1c2b45] shadow-[0_6px_0_rgba(28,43,69,0.35)] transition-[filter] hover:brightness-105 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={busy}
          onClick={() => setConfirmEnd(true)}
        >
          <Flag className="size-5" aria-hidden="true" />
          End turn
        </button>
      )}
      {/* The range toggle is only discoverable if it is on screen — a chip
          while a unit is selected, clickable for pointer-only players. */}
      {state.kind === "unit-selected" && (
        <button
          type="button"
          aria-pressed={showRange}
          onClick={() => setShowRange(!showRange)}
          className={cn(
            "pointer-events-auto absolute bottom-4 left-4 flex items-center gap-2 rounded-2xl border-[3px] border-[#1c2b45] px-3 py-1.5 font-display text-sm font-extrabold shadow-[0_4px_0_rgba(28,43,69,0.3)] transition-[filter] hover:brightness-105 active:translate-y-0.5",
            showRange
              ? "bg-[#e2453a] text-white"
              : "bg-[#fff6e0] text-[#1c2b45]",
          )}
        >
          <Crosshair className="size-4" aria-hidden="true" />
          Range
          <kbd className="rounded-md border-2 border-current px-1.5 text-[11px] leading-4 opacity-80">
            Space
          </kbd>
        </button>
      )}

      {/* Zoom control — 10% steps; tile size snaps to whole CSS pixels. */}
      <div className="pointer-events-auto absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-2xl border-[3px] border-[#1c2b45] bg-[#fff6e0] px-2.5 py-1.5 shadow-[0_5px_0_rgba(28,43,69,0.3)]">
        <button
          type="button"
          aria-label="Zoom out"
          disabled={zoom <= ZOOM_MIN}
          onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
          className="grid size-9 place-items-center rounded-xl border-2 border-[#1c2b45] bg-white text-[#1c2b45] shadow-[0_2px_0_rgba(28,43,69,0.25)] transition-[filter,transform] hover:brightness-105 active:translate-y-0.5 disabled:opacity-40"
        >
          <Minus className="size-4" aria-hidden="true" />
        </button>
        <span className="w-12 text-center font-display text-sm font-extrabold text-[#1c2b45]">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          aria-label="Zoom in"
          disabled={zoom >= ZOOM_MAX}
          onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
          className="grid size-9 place-items-center rounded-xl border-2 border-[#1c2b45] bg-white text-[#1c2b45] shadow-[0_2px_0_rgba(28,43,69,0.25)] transition-[filter,transform] hover:brightness-105 active:translate-y-0.5 disabled:opacity-40"
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </div>
      {banner && (
        <div
          role="status"
          className="pointer-events-none absolute inset-x-0 top-28 flex justify-center"
        >
          <span className="rounded-2xl border-[3px] border-[#1c2b45] bg-[#fff6e0] px-6 py-2 font-display text-xl font-extrabold text-[#1c2b45] shadow-[0_5px_0_rgba(28,43,69,0.32)]">
            {banner}
          </span>
        </div>
      )}

      {/* End-turn confirmation (no undo) — mirrors the design's dialog. */}
      {confirmEnd && (
        <div
          role="presentation"
          onClick={() => setConfirmEnd(false)}
          className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-[#1c2b45]/55 p-6"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="end-turn-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-[22px] border-[3px] border-[#1c2b45] bg-[#fff6e0] p-7 text-center shadow-[0_8px_0_rgba(28,43,69,0.35)]"
          >
            <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl border-[3px] border-[#1c2b45] bg-gradient-to-b from-[#ffd94a] to-[#f5b820] shadow-[0_4px_0_rgba(28,43,69,0.3)]">
              <Flag className="size-8 text-[#1c2b45]" aria-hidden="true" />
            </div>
            <h2
              id="end-turn-title"
              className="font-display text-2xl font-extrabold text-[#1c2b45]"
            >
              End your turn?
            </h2>
            <p className="mx-auto mt-3 max-w-sm text-sm font-semibold text-[#7a6f57]">
              {view.turnDeadlineAt
                ? `Your opponent is notified and has until the deadline (${formatCountdown(view.turnDeadlineAt, new Date())}) to respond. You can't act again until then.`
                : "Your opponent is notified and can respond in their own time. You can't act again until then."}
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmEnd(false)}
                className="flex-1 rounded-xl border-[3px] border-[#1c2b45] bg-white px-5 py-3 font-display text-base font-extrabold text-[#1c2b45] shadow-[0_4px_0_rgba(28,43,69,0.22)] transition-[filter,transform] hover:brightness-105 active:translate-y-0.5"
              >
                Not yet
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setConfirmEnd(false);
                  void endTurn();
                }}
                className="flex-1 rounded-xl border-[3px] border-[#1c2b45] bg-gradient-to-b from-[#ffd94a] to-[#f5b820] px-5 py-3 font-display text-base font-extrabold text-[#1c2b45] shadow-[0_4px_0_rgba(28,43,69,0.3)] transition-[filter,transform] hover:brightness-105 active:translate-y-0.5 disabled:opacity-60"
              >
                End turn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
