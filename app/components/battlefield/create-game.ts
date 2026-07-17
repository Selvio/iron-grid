import Phaser from "phaser";

import {
  FACTION_SHEETS,
  TERRAIN_TILE_PX,
  terrainTileFrame,
} from "@/app/lib/render/derive-render-data";
import type { AnimationStep } from "@/app/lib/render/animation-plan";
import type { TerrainCell } from "@/app/lib/render/terrain-map";
import type { UnitSprite } from "@/app/lib/render/unit-map";

/**
 * The Phaser bootstrap — a thin imperative shell (M10-T1/T2).
 *
 * The one place framework code touches the canvas. It holds **no game logic**
 * (that lives in the pure render/interaction modules) and is not unit-tested —
 * jsdom has no WebGL, so the canvas is verified manually / in M12. T2 draws the
 * terrain render model + fog overlay + camera; later tickets attach unit/property
 * layers and the interaction bridge.
 *
 * Assets are the bundled `game-assets/` pack (Aleksandr Makarov / @IKnowKingRabbit
 * — attribution in `/credits`, `game-assets/license.txt`).
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T2)
 */

const ASSET_BASE = "/game-assets";
const RENDER_SCALE = 2;

export interface BattlefieldData {
  readonly terrain: readonly TerrainCell[];
  readonly units: readonly UnitSprite[];
  readonly mapWidth: number;
  readonly mapHeight: number;
}

class BattlefieldScene extends Phaser.Scene {
  private readonly model: BattlefieldData;
  private readonly unitSprites = new Map<string, Phaser.GameObjects.Image>();

  constructor(data: BattlefieldData) {
    super("battlefield");
    this.model = data;
  }

  preload(): void {
    this.load.spritesheet("tileset", `${ASSET_BASE}/tileset/tileset.png`, {
      frameWidth: TERRAIN_TILE_PX,
      frameHeight: TERRAIN_TILE_PX,
    });
    this.load.image("fog", `${ASSET_BASE}/tileset/fog-of-war.png`);
    this.load.image("shadow", `${ASSET_BASE}/tileset/small-unit-shadow.png`);
    for (const [faction, file] of Object.entries(FACTION_SHEETS)) {
      this.load.image(`units-${faction}`, `${ASSET_BASE}/units/${file}`);
    }
  }

  /** Draws unit sprites, bottom-centered over their 24px tile. */
  private drawUnits(): void {
    for (const unit of this.model.units) {
      const key = `units-${unit.faction}`;
      const frameName = `f${unit.frame.y}_${unit.frame.x}`;
      const texture = this.textures.get(key);
      if (!texture.has(frameName)) {
        texture.add(
          frameName,
          0,
          unit.frame.x,
          unit.frame.y,
          unit.frame.width,
          unit.frame.height,
        );
      }
      const worldX = unit.x * TERRAIN_TILE_PX + TERRAIN_TILE_PX / 2;
      const worldY = (unit.y + 1) * TERRAIN_TILE_PX;
      if (unit.shadow) {
        this.add.image(worldX, worldY, "shadow").setOrigin(0.5, 1);
      }
      const sprite = this.add
        .image(worldX, worldY, key, frameName)
        .setOrigin(0.5, 1);
      if (unit.greyed) sprite.setTint(0x8a94a3);
      if (unit.submerged) sprite.setAlpha(0.55);
      this.unitSprites.set(unit.unitId, sprite);
    }
  }

  create(): void {
    const columns = Math.max(1, Math.floor(240 / TERRAIN_TILE_PX)); // tileset is 10 wide
    for (const cell of this.model.terrain) {
      const frame = terrainTileFrame(cell.renderTileId);
      const frameIndex =
        (frame.y / TERRAIN_TILE_PX) * columns + frame.x / TERRAIN_TILE_PX;
      this.add
        .image(
          cell.x * TERRAIN_TILE_PX,
          cell.y * TERRAIN_TILE_PX,
          "tileset",
          frameIndex,
        )
        .setOrigin(0, 0);
      if (!cell.visible) {
        this.add
          .rectangle(
            cell.x * TERRAIN_TILE_PX,
            cell.y * TERRAIN_TILE_PX,
            TERRAIN_TILE_PX,
            TERRAIN_TILE_PX,
            0x0b0e14,
            0.45,
          )
          .setOrigin(0, 0);
      }
    }
    this.drawUnits();
    this.cameras.main
      .setBounds(
        0,
        0,
        this.model.mapWidth * TERRAIN_TILE_PX,
        this.model.mapHeight * TERRAIN_TILE_PX,
      )
      .setZoom(RENDER_SCALE);
  }

  /**
   * Plays a resolved-event animation plan (M10-T8). Imperative and verified
   * manually — moves tween the sprite along the path, attacks flash the
   * defender, destroys fade it out. Animation never gates gameplay (§28.2): the
   * refetched state is already authoritative when this runs.
   */
  playAnimation(steps: readonly AnimationStep[]): void {
    for (const step of steps) {
      if (step.kind === "move") {
        const sprite = this.unitSprites.get(step.unitId);
        if (sprite === undefined) continue;
        this.tweens.add({
          targets: sprite,
          x: step.path.at(-1)!.x * TERRAIN_TILE_PX + TERRAIN_TILE_PX / 2,
          y: (step.path.at(-1)!.y + 1) * TERRAIN_TILE_PX,
          duration: 120 * Math.max(1, step.path.length - 1),
        });
      } else if (step.kind === "attack") {
        const defender = this.unitSprites.get(step.defenderUnitId);
        if (defender !== undefined) defender.setTint(0xffffff);
      } else if (step.kind === "destroy") {
        const sprite = this.unitSprites.get(step.unitId);
        if (sprite !== undefined) {
          this.tweens.add({ targets: sprite, alpha: 0, duration: 200 });
        }
      }
    }
  }
}

/** Creates the Phaser game mounted in `container`. Call only in the browser. */
export function createBattlefieldGame(
  container: HTMLElement,
  data: BattlefieldData,
): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: container,
    backgroundColor: "#0b0e14",
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [new BattlefieldScene(data)],
  });
}
