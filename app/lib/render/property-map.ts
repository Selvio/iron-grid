import type { FactionId } from "@/app/components/faction-badge";
import type { MatchView } from "@/app/lib/api-client";
import { keysWithPrefix } from "@/app/lib/render/atlas";

/**
 * Property render model (M10-T9, re-based on the colored building art in M12).
 *
 * Turns `MatchView.properties` into draw instructions: which building sprite,
 * in whose colors, and how far a capture has progressed. The art pack draws
 * every property in five ownership palettes, so ownership is a different sprite
 * rather than the programmatic tint ADR-0004 settled for — that ADR is
 * superseded. Capture progress stays a drawn bar. Owned buildings also carry a
 * two-frame flag loop (`building_*_*_0` / `_1`) that the scene cycles on its
 * own slower timer.
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T9)
 * @see docs/decisions/0005-advance-wars-asset-pack.md
 */

/** Property capture resistance starts at 20 (`properties.yaml`). */
export const MAX_CAPTURE_POINTS = 20;

/** Property type → the atlas building family drawing it. */
export const PROPERTY_BUILDING: Record<string, string> = {
  city: "city",
  base: "base",
  airport: "airport",
  port: "port",
  headquarters: "headquarters",
  silo: "silo",
};

/**
 * The atlas key for a building: `building_<type>_<color>_<frame>`. A property
 * mid-capture keeps its current owner's colors — the capture bar communicates
 * the takeover, exactly as the flag animation does in the original.
 */
export function buildingTileId(
  typeId: string,
  ownerFaction: FactionId | null,
  frame = 0,
): string {
  const family = PROPERTY_BUILDING[typeId] ?? "city";
  // The headquarters has no neutral art (an HQ always belongs to someone); fall
  // back to a city so a mis-seeded map still renders something.
  const color = ownerFaction ?? (family === "headquarters" ? "red" : "neutral");
  return `building_${family}_${color}_${frame}`;
}

/** Strip the trailing frame index from a building atlas key. */
export function buildingBaseKey(tileId: string): string {
  return tileId.replace(/_\d+$/, "");
}

/**
 * How many flag-loop frames the pack has for this building key. Returns 0 for
 * unnumbered keys such as `building_silo_spent`.
 */
export function buildingFrameCount(tileId: string): number {
  return keysWithPrefix(`${buildingBaseKey(tileId)}_`).length;
}

/** Atlas key for one frame of a building's flag loop. */
export function buildingFrameId(tileId: string, frame: number): string {
  const count = buildingFrameCount(tileId);
  if (count === 0) return tileId;
  const index = ((frame % count) + count) % count;
  return `${buildingBaseKey(tileId)}_${index}`;
}

export interface PropertySprite {
  readonly propertyId: string;
  readonly x: number;
  readonly y: number;
  readonly typeId: string;
  readonly renderTileId: string;
  /** The owning faction, or null when the property is neutral. */
  readonly ownerFaction: FactionId | null;
  /**
   * Faction of the unit currently capturing, or null when uncontested.
   * Used so mid-capture (ownership not yet flipped) still shows a faction tint.
   */
  readonly capturingFaction: FactionId | null;
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

/** Resolve the capturer's faction from `capturingUnitId` → unit owner → faction. */
function capturingFactionFor(
  view: MatchView,
  capturingUnitId: string | null,
  factions: Record<string, FactionId>,
): FactionId | null {
  if (capturingUnitId == null) return null;
  const unit = view.units.find((u) => u.id === capturingUnitId);
  if (unit === undefined) return null;
  return factions[unit.ownerPlayerId] ?? null;
}

export function buildPropertyRenderModel(view: MatchView): PropertySprite[] {
  const factions = factionByPlayer(view);
  return view.properties.map((property) => {
    const ownerFaction =
      property.ownerPlayerId === null
        ? null
        : (factions[property.ownerPlayerId] ?? null);
    return {
      propertyId: property.id,
      x: property.position.x,
      y: property.position.y,
      typeId: property.typeId,
      renderTileId: buildingTileId(property.typeId, ownerFaction),
      ownerFaction,
      capturingFaction: capturingFactionFor(
        view,
        property.capturingUnitId,
        factions,
      ),
      captureProgress:
        (MAX_CAPTURE_POINTS - property.capturePointsRemaining) /
        MAX_CAPTURE_POINTS,
    };
  });
}
