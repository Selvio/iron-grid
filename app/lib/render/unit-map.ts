import type { FactionId } from "@/app/components/faction-badge";
import type { MatchView } from "@/app/lib/api-client";

import { unitFrame, type FrameRect } from "./derive-render-data";

/**
 * Unit sprite render model (M10-T3).
 *
 * Turns the projected `MatchView.units` into draw instructions the Phaser scene
 * places over the tile grid: the §9.5 sprite row (from the server-supplied
 * `unitRender` table — the client cannot load game data), the faction sheet
 * resolved from the unit's owner, and the projected visual states — acted/greyed
 * (§10.5) and submarine surfaced/submerged (§19.5). Cargo units (null position)
 * are not drawn. Pure and unit-tested; the scene consumes the output.
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T3)
 */

export interface UnitSprite {
  readonly unitId: string;
  readonly x: number;
  readonly y: number;
  readonly faction: FactionId;
  readonly frame: FrameRect;
  /** Air units are elevated and draw a ground shadow. */
  readonly shadow: boolean;
  /** The viewer's own unit that has already acted this turn (§10.5). */
  readonly greyed: boolean;
  /** A dived submarine (§19.5) — rendered translucent by the scene. */
  readonly submerged: boolean;
}

function factionByPlayer(view: MatchView): Record<string, FactionId> {
  const table: Record<string, FactionId> = {};
  if (view.you) table[view.you.playerId] = view.you.factionId as FactionId;
  if (view.opponent) {
    table[view.opponent.playerId] = view.opponent.factionId as FactionId;
  }
  return table;
}

export function buildUnitRenderModel(view: MatchView): UnitSprite[] {
  const factions = factionByPlayer(view);
  const sprites: UnitSprite[] = [];

  for (const unit of view.units) {
    if (unit.position === null) continue; // cargo — not on the board
    const meta = view.unitRender[unit.typeId];
    if (meta === undefined) continue; // unknown type — nothing to draw
    const faction = factions[unit.ownerPlayerId];
    if (faction === undefined) continue;

    const submerged = unit.specialState === "submerged";
    const spriteRow =
      submerged && meta.submergedRow !== null
        ? meta.submergedRow
        : meta.spriteRow;

    sprites.push({
      unitId: unit.id,
      x: unit.position.x,
      y: unit.position.y,
      faction,
      frame: unitFrame(spriteRow, "idle", 0),
      shadow: meta.isAir,
      greyed: unit.ownerPlayerId === view.viewerPlayerId && unit.hasActed,
      submerged,
    });
  }

  return sprites;
}
