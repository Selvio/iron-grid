import type { FactionId } from "@/app/components/faction-badge";
import type { MatchView } from "@/app/lib/api-client";

/**
 * Property render model (M10-T9).
 *
 * Turns `MatchView.properties` into draw instructions: the building tile, the
 * ownership state (neutral or a faction) and the capture-progress fraction. Per
 * the §33.4 treatment (ADR-0004), the building tiles come from the pack and the
 * ownership + capture state render as a **programmatic overlay** (a faction tint
 * + insignia, a capture bar) rather than four bespoke colorized building sets.
 * Pure and unit-tested; the exact tileset cells are provisional and confirmed
 * visually in M12.
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T9)
 * @see docs/01-specification/game-specification.md §13, §33.4
 */

/** Property capture resistance starts at 20 (`properties.yaml`). */
export const MAX_CAPTURE_POINTS = 20;

/** Base building tile per property type (§33.4, ADR-0004; provisional cells). */
export const PROPERTY_TILE: Record<string, string> = {
  city: "terrain_r12_c00",
  base: "terrain_r13_c00",
  airport: "terrain_r14_c00",
  port: "terrain_r15_c00",
  headquarters: "terrain_r12_c07",
};

export interface PropertySprite {
  readonly propertyId: string;
  readonly x: number;
  readonly y: number;
  readonly typeId: string;
  readonly renderTileId: string;
  /** The owning faction, or null when the property is neutral. */
  readonly ownerFaction: FactionId | null;
  /** Capture progress in [0, 1]; 0 when uncontested. */
  readonly captureProgress: number;
}

function factionByPlayer(view: MatchView): Record<string, FactionId> {
  const table: Record<string, FactionId> = {};
  if (view.you) table[view.you.playerId] = view.you.factionId as FactionId;
  if (view.opponent) {
    table[view.opponent.playerId] = view.opponent.factionId as FactionId;
  }
  return table;
}

export function buildPropertyRenderModel(view: MatchView): PropertySprite[] {
  const factions = factionByPlayer(view);
  return view.properties.map((property) => ({
    propertyId: property.id,
    x: property.position.x,
    y: property.position.y,
    typeId: property.typeId,
    renderTileId: PROPERTY_TILE[property.typeId] ?? PROPERTY_TILE.city,
    ownerFaction:
      property.ownerPlayerId === null
        ? null
        : (factions[property.ownerPlayerId] ?? null),
    captureProgress:
      (MAX_CAPTURE_POINTS - property.capturePointsRemaining) /
      MAX_CAPTURE_POINTS,
  }));
}
