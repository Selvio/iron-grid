"use client";

import type { Coordinate } from "game-engine";
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
  artScale = 3,
  moveRange = [],
  attackRange = [],
  onSceneReady,
}: {
  matchView: MatchView;
  /** Integer multiple of the 16px source tile at 100% (may be fractional when zoomed). */
  artScale?: number;
  /** Tiles the selected unit may move to — drawn under the units. */
  moveRange?: readonly Coordinate[];
  /** Tiles it threatens — drawn under the units. */
  attackRange?: readonly Coordinate[];
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

  // Ranges are pushed separately from the board model: they change on every
  // selection (and the arrays are rebuilt on every render), while syncModel
  // tears down and redraws every sprite — which would kill a walk animation
  // mid-step and reset the idle loop each time the cursor moves.
  const rangeKey = useMemo(
    () =>
      [moveRange, attackRange]
        .map((tiles) => tiles.map((t) => `${t.x},${t.y}`).join("|"))
        .join("#"),
    [moveRange, attackRange],
  );
  const rangesRef = useRef({ moveRange, attackRange });

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
    rangesRef.current = { moveRange, attackRange };
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
          // The scene boots after the range effect has already run once.
          handle.setRanges(
            rangesRef.current.moveRange,
            rangesRef.current.attackRange,
          );
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

  useEffect(() => {
    handleRef.current?.setRanges(moveRange, attackRange);
    // `rangeKey` is the content of the two arrays, which are new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);

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
