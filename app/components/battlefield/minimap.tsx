"use client";

import type { GameData } from "game-data";

import type { MatchView } from "@/app/lib/api-client";

/**
 * Battlefield minimap (Advance-Wars overview).
 *
 * A tiny DOM grid rendered from the projected `MatchView`: each tile coloured by
 * terrain group, owned properties tinted by their faction, and a small dot per
 * visible unit in its owner's colour. Pure presentation, no interaction — a
 * glanceable board overview in the corner.
 */

const CELL_PX = 6;

/** Faction id → overview colour (matches the canvas ownership tints, §33.4). */
const FACTION_COLOR: Record<string, string> = {
  blue: "#4c8dff",
  green: "#4fb85f",
  red: "#f0616d",
  yellow: "#e6b23a",
};
const NEUTRAL = "#9aa4b2";

/** Terrain group → base colour; falls back to a neutral land tone. */
function terrainColor(
  gameData: GameData,
  terrainId: string | undefined,
): string {
  const group = terrainId ? gameData.terrain[terrainId]?.group : undefined;
  switch (group) {
    case "water":
      return "#274b6d";
    case "land":
      return "#3c5a37";
    case "structure":
    case "property":
      return "#5a5240";
    default:
      return "#455063";
  }
}

export function Minimap({
  view,
  gameData,
}: {
  view: MatchView;
  gameData: GameData;
}) {
  const { width, height } = view.map;
  const factionOf = (playerId: string | null): string => {
    if (playerId === null) return NEUTRAL;
    if (view.you?.playerId === playerId) {
      return FACTION_COLOR[view.you.factionId] ?? NEUTRAL;
    }
    if (view.opponent?.playerId === playerId) {
      return FACTION_COLOR[view.opponent.factionId] ?? NEUTRAL;
    }
    return NEUTRAL;
  };

  const propertyAt = new Map<string, string>();
  for (const p of view.properties) {
    propertyAt.set(
      `${p.position.x},${p.position.y}`,
      factionOf(p.ownerPlayerId),
    );
  }
  const unitAt = new Map<string, string>();
  for (const u of view.units) {
    if (u.position === null) continue;
    unitAt.set(`${u.position.x},${u.position.y}`, factionOf(u.ownerPlayerId));
  }

  const cells: React.ReactNode[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const key = `${x},${y}`;
      const property = propertyAt.get(key);
      const unit = unitAt.get(key);
      cells.push(
        <div
          key={key}
          style={{
            backgroundColor:
              property ??
              terrainColor(gameData, view.map.logicalTerrain[y]?.[x]),
          }}
        >
          {unit && (
            <div
              className="h-full w-full"
              style={{
                backgroundColor: unit,
                clipPath: "circle(40% at 50% 50%)",
              }}
            />
          )}
        </div>,
      );
    }
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute right-4 top-20 rounded border border-border/70 bg-card/80 p-1 shadow-lg backdrop-blur"
    >
      <div
        className="grid gap-px"
        style={{
          gridTemplateColumns: `repeat(${width}, ${CELL_PX}px)`,
          gridTemplateRows: `repeat(${height}, ${CELL_PX}px)`,
        }}
      >
        {cells}
      </div>
    </div>
  );
}
