"use client";

import { useEffect, useRef } from "react";

/**
 * Battlefield canvas host (M10-T1).
 *
 * Mounts the Phaser game in a client-only `useEffect` (Phaser touches `window`,
 * so it never runs during SSR or in tests) and tears it down on unmount. The
 * Phaser bootstrap is dynamically imported so the heavy canvas module stays out
 * of the server bundle and out of the jsdom test path. Later tickets feed the
 * projected `MatchView` and the interaction bridge in; T1 just proves the mount
 * and asset pipeline.
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T1)
 */
export function Battlefield() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    let destroyed = false;
    let game: { destroy: (removeCanvas: boolean) => void } | undefined;

    void import("./create-game").then(({ createBattlefieldGame }) => {
      if (destroyed) return;
      game = createBattlefieldGame(container);
    });

    return () => {
      destroyed = true;
      game?.destroy(true);
    };
  }, []);

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
