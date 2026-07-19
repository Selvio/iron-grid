import { displayHp } from "game-engine";

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
  /** The unit's atlas sprite family — the scene picks clips off it. */
  readonly spriteKey: string;
  /** The resting idle frame, ready to draw. */
  readonly frame: FrameRect;
  /** Air units are elevated and draw a ground shadow. */
  readonly shadow: boolean;
  /** The viewer's own unit that has already acted this turn (§10.5). */
  readonly greyed: boolean;
  /** A dived submarine (§19.5) — rendered translucent by the scene. */
  readonly submerged: boolean;
  /** Display HP on the 0–10 scale; the scene shows it only below 10 (§27.4). */
  readonly displayHp: number;
  /** The idle sprite faces right; flip it when the enemy base is to the left. */
  readonly faceLeft: boolean;
}

function factionByPlayer(view: MatchView): Record<string, FactionId> {
  const table: Record<string, FactionId> = {};
  if (view.you) table[view.you.playerId] = view.you.factionId as FactionId;
  if (view.opponent) {
    table[view.opponent.playerId] = view.opponent.factionId as FactionId;
  }
  return table;
}

/** Each player's headquarters x (properties are public), for enemy-base facing. */
function hqXByOwner(view: MatchView): Map<string, number> {
  const map = new Map<string, number>();
  for (const property of view.properties ?? []) {
    if (property.typeId === "headquarters" && property.ownerPlayerId !== null) {
      map.set(property.ownerPlayerId, property.position.x);
    }
  }
  return map;
}

export function buildUnitRenderModel(view: MatchView): UnitSprite[] {
  const factions = factionByPlayer(view);
  const hqX = hqXByOwner(view);
  const sprites: UnitSprite[] = [];

  for (const unit of view.units) {
    if (unit.position === null) continue; // cargo — not on the board
    const meta = view.unitRender[unit.typeId];
    if (meta === undefined) continue; // unknown type — nothing to draw
    const faction = factions[unit.ownerPlayerId];
    if (faction === undefined) continue;

    const submerged = unit.specialState === "submerged";
    const spriteKey =
      submerged && meta.submergedSpriteKey !== null
        ? meta.submergedSpriteKey
        : meta.spriteKey;

    // Face the opponent's HQ (left/right only): the idle art points right, so
    // flip when the enemy base sits to the left of this unit's own base.
    const ownHqX = hqX.get(unit.ownerPlayerId);
    let enemyHqX: number | undefined;
    for (const [owner, x] of hqX) {
      if (owner !== unit.ownerPlayerId) {
        enemyHqX = x;
        break;
      }
    }
    const faceLeft =
      ownHqX !== undefined && enemyHqX !== undefined && enemyHqX < ownHqX;

    sprites.push({
      unitId: unit.id,
      x: unit.position.x,
      y: unit.position.y,
      faction,
      spriteKey,
      frame: unitFrame(spriteKey, "idle", 0),
      shadow: meta.isAir,
      greyed: unit.ownerPlayerId === view.viewerPlayerId && unit.hasActed,
      submerged,
      displayHp: displayHp(unit.trueHp),
      faceLeft,
    });
  }

  return sprites;
}
