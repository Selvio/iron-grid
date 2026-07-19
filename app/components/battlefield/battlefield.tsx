"use client";

import { useEffect, useMemo, useRef } from "react";

import type { MatchView } from "@/app/lib/api-client";
import { buildPropertyRenderModel } from "@/app/lib/render/property-map";
import { buildTerrainRenderModel } from "@/app/lib/render/terrain-map";
import { buildUnitRenderModel } from "@/app/lib/render/unit-map";

import type { BattlefieldData, BattlefieldHandle } from "./create-game";

/**
 * Battlefield canvas host (M10).
 *
 * Mounts the Phaser game **once** (client-only; Phaser touches `window`, so it
 * never runs during SSR or in tests) and reconciles in place on every state
 * change via `handle.syncModel` — no destroy/recreate, so the board never
 * flickers. The scene handle is surfaced through `onSceneReady` so the controller
 * can drive the move animation. The bootstrap is dynamically imported to keep the
 * canvas module out of the server bundle and the jsdom test path.
 *
 * @see docs/04-development/milestones/m10-battlefield.md
 */
export function Battlefield({
  matchView,
  artScale = 2,
  onSceneReady,
}: {
  matchView: MatchView;
  /** Integer multiple of the 24px source tile at 100% (may be fractional when zoomed). */
  artScale?: number;
  onSceneReady?: (handle: BattlefieldHandle) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<BattlefieldHandle | null>(null);

  const data: BattlefieldData = useMemo(
    () => ({
      terrain: buildTerrainRenderModel(matchView.map, matchView.visibleTiles),
      properties: buildPropertyRenderModel(matchView),
      units: buildUnitRenderModel(matchView),
      mapWidth: matchView.map.width,
      mapHeight: matchView.map.height,
    }),
    [matchView],
  );

  // Latest values read by the create-once effect without re-running it. Seeded
  // from the first render (useRef) and refreshed after each render (never in
  // render — the async create callback may fire after a later render).
  const dataRef = useRef(data);
  const onReadyRef = useRef(onSceneReady);
  const artScaleRef = useRef(artScale);
  useEffect(() => {
    dataRef.current = data;
    onReadyRef.current = onSceneReady;
    artScaleRef.current = artScale;
  });

  // Create the game ONCE; destroy only on unmount.
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    let destroyed = false;
    let game: { destroy: (removeCanvas: boolean) => void } | undefined;

    void import("./create-game").then(({ createBattlefieldGame }) => {
      if (destroyed) return;
      game = createBattlefieldGame(
        container,
        dataRef.current,
        (handle) => {
          handleRef.current = handle;
          onReadyRef.current?.(handle);
        },
        artScaleRef.current,
      );
    });

    return () => {
      destroyed = true;
      handleRef.current = null;
      game?.destroy(true);
    };
  }, []);

  // Reconcile in place whenever the projected view changes. No-op on mount while
  // the scene boots async (the initial draw comes from the scene's own create()).
  useEffect(() => {
    handleRef.current?.syncModel(data);
  }, [data]);

  // Re-render at the chosen art scale (integer tile pixels — no CSS transform).
  useEffect(() => {
    handleRef.current?.setArtScale(artScale);
  }, [artScale]);

  return (
    <div
      ref={containerRef}
      data-testid="battlefield-canvas"
      className="h-full w-full"
      role="img"
      aria-label="Battlefield"
    />
  );
}
