"use client";

import { useEffect, useMemo, useRef } from "react";

import type { MatchView } from "@/app/lib/api-client";
import { buildTerrainRenderModel } from "@/app/lib/render/terrain-map";
import { buildUnitRenderModel } from "@/app/lib/render/unit-map";

/**
 * Battlefield canvas host (M10-T1/T2).
 *
 * Mounts the Phaser game in a client-only `useEffect` (Phaser touches `window`,
 * so it never runs during SSR or in tests) and tears it down on unmount. The
 * Phaser bootstrap is dynamically imported so the canvas module stays out of the
 * server bundle and the jsdom test path. T2 feeds the terrain render model built
 * from the projected `MatchView`; later tickets add unit/property layers and the
 * interaction bridge.
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T2)
 */
export function Battlefield({ matchView }: { matchView: MatchView }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const data = useMemo(
    () => ({
      terrain: buildTerrainRenderModel(matchView.map, matchView.visibleTiles),
      units: buildUnitRenderModel(matchView),
      mapWidth: matchView.map.width,
      mapHeight: matchView.map.height,
    }),
    [matchView],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    let destroyed = false;
    let game: { destroy: (removeCanvas: boolean) => void } | undefined;

    void import("./create-game").then(({ createBattlefieldGame }) => {
      if (destroyed) return;
      game = createBattlefieldGame(container, data);
    });

    return () => {
      destroyed = true;
      game?.destroy(true);
    };
  }, [data]);

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
