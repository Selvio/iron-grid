import Phaser from "phaser";

import {
  TERRAIN_TILE_PX,
  terrainTileFrame,
} from "@/app/lib/render/derive-render-data";
import type { TerrainCell } from "@/app/lib/render/terrain-map";

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
  readonly mapWidth: number;
  readonly mapHeight: number;
}

class BattlefieldScene extends Phaser.Scene {
  private readonly model: BattlefieldData;

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
    this.cameras.main
      .setBounds(
        0,
        0,
        this.model.mapWidth * TERRAIN_TILE_PX,
        this.model.mapHeight * TERRAIN_TILE_PX,
      )
      .setZoom(RENDER_SCALE);
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
